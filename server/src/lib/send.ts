import { logMessage } from '../lib/events';
import { sendMessage } from '../whatsapp/api';
import type { OutMessage } from '../whatsapp/spec';

/**
 * Single place where a message leaves the system. Also writes the log row.
 *
 * Returns true when WhatsApp accepted the send, false when it failed. Most
 * callers ignore the result - a failed message is logged and swallowed so one
 * bad number cannot abort a batch - but lead dispatch needs it to tell "nobody
 * was in range" apart from "our send broke".
 */
export async function send(
  phone: string,
  role: 'rider' | 'driver',
  msg: OutMessage,
  opts: { sessionState?: string | null; tripId?: string | null } = {},
): Promise<boolean> {
  logMessage({
    phone,
    direction: 'outbound',
    role,
    messageType: msg.kind,
    body: msg.kind === 'location' ? `${msg.lat},${msg.lng}` : msg.body,
    tripId: opts.tripId ?? null,
    sessionState: opts.sessionState ?? null,
    rawPayload: msg as unknown as Record<string, unknown>,
  });
  try {
    await sendMessage(phone, msg);
    return true;
  } catch (e) {
    console.error('[SEND ERROR]', phone, e);
    return false;
  }
}
