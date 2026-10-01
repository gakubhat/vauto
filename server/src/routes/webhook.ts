import { Request, Response, Router } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'node:crypto';
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
import { getSettings } from '../state/queries';
import { normalisePhone } from '../lib/help';

/**
 * Download a WhatsApp media message and store it in a private bucket.
 *
 * Returns the object **path** (not a URL): the bucket is private, so a public
 * URL would always 400. The admin asks for a signed URL when it displays the
 * document.
 *
 * Failure is reported explicitly rather than swallowed - a driver whose upload
 * fails must not be told to "send a photo" as though they had sent nothing.
 */
async function downloadAndUpload(
  message: Record<string, unknown>,
  bucket: string,
): Promise<{ path: string | null; error: string | null }> {
  const image = message.image as Record<string, unknown> | undefined;
  const id = image?.id as string | undefined;
  if (!id) return { path: null, error: 'no media id on the message' };

  const mimeType = (image?.mime_type as string | undefined) ?? 'image/jpeg';
  // WhatsApp says how big it is; refuse anything implausible before downloading.
  const declaredSize = Number(image?.file_size ?? 0);
  const MAX_BYTES = 5 * 1024 * 1024;
  if (declaredSize > MAX_BYTES) {
    return { path: null, error: `file too large (${declaredSize} bytes)` };
  }
  const okType = /^image\/(jpeg|png|webp|heic|heif)$/i.test(mimeType);
  if (!okType) return { path: null, error: `unsupported type ${mimeType}` };

  try {
    const metaRes = await fetch(`${GRAPH_API}/${id}`, {
      headers: { Authorization: `Bearer ${config.whatsappAccessToken}` },
    });
    if (!metaRes.ok) return { path: null, error: `media lookup ${metaRes.status}` };
    const meta = (await metaRes.json()) as Record<string, unknown>;
    const downloadUrl = meta.url as string | undefined;
    if (!downloadUrl) return { path: null, error: 'no download url from Meta' };

    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${config.whatsappAccessToken}` },
    });
    if (!fileRes.ok) return { path: null, error: `media download ${fileRes.status}` };
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    if (buffer.byteLength === 0) return { path: null, error: 'empty download' };
    if (buffer.byteLength > MAX_BYTES) return { path: null, error: 'file too large' };

    const ext = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : mimeType.includes('hei')
          ? 'heic'
          : 'jpg';
    const fileName = `${uuid()}.${ext}`;
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });
    if (error || !data) {
      return { path: null, error: `storage upload failed: ${error?.message ?? 'unknown'}` };
    }
    // Store the path. The private bucket has no readable public URL.
    return { path: fileName, error: null };
  } catch (e) {
    return { path: null, error: `upload threw: ${(e as Error).message}` };
  }
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

/**
 * Verify Meta's X-Hub-Signature-256: an HMAC-SHA256 of the raw request body
 * keyed by the app secret. Without this, anyone who learns the webhook URL can
 * inject fabricated messages, trips and quotes - the app trusts the payload
 * completely.
 *
 * Returns false when the header is absent, malformed, or simply wrong.
 */
function signatureIsValid(req: Request): boolean {
  const header = req.header('x-hub-signature-256');
  if (!header || !header.startsWith('sha256=')) return false;

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;

  const expected = crypto
    .createHmac('sha256', config.whatsappAppSecret)
    .update(raw)
    .digest('hex');
  const received = header.slice('sha256='.length);

  // Constant-time compare; lengths must match or timingSafeEqual throws.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
  // Verified before anything is parsed or acted on. A forged request gets a
  // 401 and never reaches a flow.
  if (!signatureIsValid(req)) {
    console.warn('[WEBHOOK] rejected: invalid or missing X-Hub-Signature-256');
    return res.status(401).send('Invalid signature');
  }

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
        // Meta's receipt carries the message id (wamid) we got back when the
        // message was sent - not the trip id. Only template sends record one,
        // so free-form leads never arrive here.
        void supabaseAdmin
          .from('lead_dispatches')
          .update(patch)
          .eq('wamid', id)
          .then(() => undefined);
      }
    }
    return;
  }

  const message = (value?.messages as Record<string, unknown>[] | undefined)?.[0];
  const from = message?.from as string | undefined;
  if (!from || !message) return;

  const phone = from.startsWith('+') ? from : `+${from}`;

  // The office answers alerts from this number. It is in neither riders nor
  // drivers, so without this guard their reply would start the Rider/Driver
  // signup with our own staff. Logged, then dropped.
  //
  // ALLOW_OFFICE_AS_USER turns the drop off, so the office can use the bot as a
  // rider for screenshots and demos. It stays on by default: with it off the
  // office can answer an alert "yes, handling it" without the bot misreading
  // that as a customer.
  const settings = await getSettings();
  if (
    !config.allowOfficeAsUser &&
    settings.office_number &&
    normalisePhone(settings.office_number) === normalisePhone(phone)
  ) {
    logMessage({
      phone,
      direction: 'inbound',
      role: 'rider',
      messageType: (message.type as string) ?? 'text',
      body: extractText(message) ?? '(office reply - not processed)',
      rawPayload: message,
    });
    return;
  }

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
    const { path, error } = await downloadAndUpload(message, config.storageBucketKyc);
    if (!path) {
      // Tell the driver it did not work instead of re-prompting as if they had
      // sent nothing. Without this they retry forever and never get approved.
      console.error('[KYC UPLOAD FAILED]', phone, error);
      const session = await getSession(phone);
      const lang = langOf(session?.data?.language as string | undefined);
      await send(phone, 'driver', tpl.kycUploadFailed(lang), {
        sessionState: session?.state ?? null,
      });
      return;
    }
    await handleDriverMessage(phone, { imageUrl: path });
    return;
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
