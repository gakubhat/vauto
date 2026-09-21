import { Request, Response, Router } from 'express';
import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { logMessage } from '../lib/events';
import { send } from '../lib/send';
import { supabaseAdmin } from '../supabase/client';
import { handleRiderMessage } from '../state/flows/rider';
import { handleDriverMessage } from '../state/flows/driver';
import {
  ensureDriver,
  ensureRider,
  getDriverByPhone,
  getRiderByPhone,
  updateTrip,
  type Trip,
} from '../state/queries';
import { getSession, upsertSession, type Session } from '../state/store';
import { handleOnboarding, startOnboarding } from '../state/onboarding';
import * as tpl from '../whatsapp/templates';
import { GRAPH_API } from '../whatsapp/api';
import { langOf } from '../whatsapp/i18n';

async function downloadAndUpload(
  message: Record<string, unknown>,
  bucket: string,
): Promise<string | null> {
  const image = message.image as Record<string, unknown> | undefined;
  const id = image?.id as string | undefined;
  if (!id) return null;

  const metaRes = await fetch(`${GRAPH_API}/${id}`, {
    headers: { Authorization: `Bearer ${config.whatsappAccessToken}` },
  });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as Record<string, unknown>;
  const downloadUrl = meta.url as string | undefined;
  if (!downloadUrl) return null;

  const fileRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${config.whatsappAccessToken}` },
  });
  if (!fileRes.ok) return null;
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const fileName = `${uuid()}.jpg`;
  const { data } = await supabaseAdmin.storage
    .from(bucket)
    .upload(fileName, buffer, { contentType: 'image/jpeg' });
  if (!data) return null;
  const { data: pubUrl } = supabaseAdmin.storage.from(bucket).getPublicUrl(fileName);
  return pubUrl?.publicUrl ?? null;
}

function extractText(message: Record<string, unknown>): string | undefined {
  if (message?.type === 'text') return (message.text as Record<string, string>)?.body;
  if (message?.type === 'interactive') {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const buttonReply = interactive?.button_reply as Record<string, string> | undefined;
    if (buttonReply) return buttonReply.id ?? buttonReply.title;
    const listReply = interactive?.list_reply as Record<string, string> | undefined;
    if (listReply) return listReply.id ?? listReply.title;
  }
  return undefined;
}

export interface InboundLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

function extractLocation(message: Record<string, unknown>): InboundLocation | undefined {
  if (message?.type === 'location') {
    const loc = message.location as Record<string, string | number> | undefined;
    if (loc?.latitude && loc?.longitude) {
      return {
        lat: Number(loc.latitude),
        lng: Number(loc.longitude),
        // Both are optional - a plain "current location" often omits them.
        ...(loc.name ? { name: String(loc.name) } : {}),
        ...(loc.address ? { address: String(loc.address) } : {}),
      };
    }
  }
  return undefined;
}

async function resolveRole(from: string): Promise<Session | null> {
  const session = await getSession(from);
  if (session) return session;

  const driver = await getDriverByPhone(from);
  if (driver) {
    await upsertSession(from, { state: 'idle', role: 'driver' });
    return await getSession(from);
  }

  const rider = await getRiderByPhone(from);
  if (rider) {
    await upsertSession(from, { state: 'idle', role: 'rider' });
    return await getSession(from);
  }

  return null;
}

export const webhookRouter = Router();

webhookRouter.get('/', (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const mode = q['hub.mode'];
  const token = q['hub.verify_token'];
  const challenge = q['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsappWebhookVerifyToken) {
    return res.status(200).type('text/plain').send(challenge ?? '');
  }
  res.status(403).send('Forbidden');
});

webhookRouter.post('/', async (req: Request, res: Response) => {
  res.status(200).send('OK');

  const body = req.body as Record<string, unknown>;
  const entry = Array.isArray(body.entry) ? (body.entry[0] as Record<string, unknown>) : undefined;
  const change = (entry?.changes as Record<string, unknown>[] | undefined)?.[0];
  const value = change?.value as Record<string, unknown> | undefined;

  // Delivery and read receipts - passive presence, no driver action needed.
  const statuses = value?.statuses as Record<string, unknown>[] | undefined;
  if (statuses?.length) {
    for (const s of statuses) {
      const id = s.id as string | undefined;
      const status = s.status as string | undefined;
      if (!id || !status) continue;
      const patch: Record<string, unknown> = {};
      if (status === 'delivered') patch.delivered_at = new Date().toISOString();
      if (status === 'read') patch.read_at = new Date().toISOString();
      if (Object.keys(patch).length) {
        void supabaseAdmin
          .from('lead_dispatches')
          .update(patch)
          .eq('trip_id', id)
          .then(() => undefined);
      }
    }
    return;
  }

  const message = (value?.messages as Record<string, unknown>[] | undefined)?.[0];
  const from = message?.from as string | undefined;
  if (!from || !message) return;

  const phone = from.startsWith('+') ? from : `+${from}`;
  const session = await resolveRole(phone);

  if (!session) {
    await startOnboarding(phone);
    return;
  }

  // Role not decided yet: language first, then rider/driver.
  if (!session.role) {
    await handleOnboarding(phone, session, extractText(message) ?? '');
    return;
  }

  const role = session.role;
  const text = extractText(message);
  const location = extractLocation(message);
  const type = message.type as string;

  logMessage({
    phone,
    direction: 'inbound',
    role: role ?? 'rider',
    messageType: type,
    body: text ?? (type === 'location' ? 'location' : type),
    tripId: session.current_trip_id,
    sessionState: session.state,
    rawPayload: message,
  });

  if (type === 'image' && role === 'driver') {
    const url = await downloadAndUpload(message, config.storageBucketKyc);
    if (url) {
      await handleDriverMessage(phone, { imageUrl: url });
      return;
    }
  }

  if (role === 'driver') {
    await handleDriverMessage(phone, { text, location }).catch((e) =>
      console.error('[DRIVER FLOW ERROR]', e),
    );
  } else if (role === 'rider') {
    await handleRiderMessage(phone, { text, location }).catch((e) =>
      console.error('[RIDER FLOW ERROR]', e),
    );
  }
});

/** Test seam: feed a raw webhook payload without HTTP. */
export async function handleInboundPayload(payload: Record<string, unknown>): Promise<void> {
  const entry = Array.isArray(payload.entry) ? (payload.entry[0] as Record<string, unknown>) : undefined;
  const change = (entry?.changes as Record<string, unknown>[] | undefined)?.[0];
  const value = change?.value as Record<string, unknown> | undefined;
  const message = (value?.messages as Record<string, unknown>[] | undefined)?.[0];
  if (!message) return;
  const from = message.from as string;
  const phone = from.startsWith('+') ? from : `+${from}`;
  const session = await getSession(phone);
  const role = session?.role;
  const text = extractText(message);
  const location = extractLocation(message);
  if (role === 'driver') await handleDriverMessage(phone, { text, location });
  else await handleRiderMessage(phone, { text, location });
}

export { updateTrip };
export type { Trip };
export { langOf };
