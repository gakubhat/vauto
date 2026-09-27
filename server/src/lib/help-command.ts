import { getSettings } from '../state/queries';
import * as tpl from '../whatsapp/templates';
import { openHelpRequest } from './help';
import type { OutMessage } from '../whatsapp/spec';
import type { Lang } from '../whatsapp/i18n';

/**
 * Is this message a request for a human?
 *
 * Checked *before* every state branch, deliberately. A rider whose auto has not
 * arrived, or a driver whose OTP is rejected, is exactly who needs to reach the
 * office - and those are the states with their own handlers. Handling "help"
 * only in `idle` meant the most likely support case was the one that failed.
 */
export function isHelpRequest(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  return lower === 'help' || lower === 'helpline' || text.trim() === 'ಸಹಾಯ';
}

/**
 * Queue the request and hand back the reply.
 *
 * The reply is unconditional: with no `helpline` configured it still says
 * something useful ("reply here and the office will help"), because a helpline
 * that stays silent is worse than none.
 */
export async function handleHelpRequest(
  phone: string,
  role: 'rider' | 'driver',
  lang: Lang,
  tripId?: string | null,
  name?: string | null,
): Promise<OutMessage> {
  await openHelpRequest({ phone, role, source: 'help', tripId: tripId ?? null, name: name ?? null });
  const settings = await getSettings();
  return tpl.helpReply(lang, settings.helpline);
}
