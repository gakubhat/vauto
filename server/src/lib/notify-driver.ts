import { langOf, type Lang } from '../whatsapp/i18n';
import { send } from '../lib/send';
import { sendTemplate } from '../whatsapp/api';
import * as tpl from '../whatsapp/templates';
import { getDriverById, getSettings } from '../state/queries';
import { inWhatsAppWindow } from './matching';

function langCode(lang: Lang): string {
  return lang === 'kannada' ? 'kn' : 'en';
}

/**
 * Tell a driver the outcome of their KYC review. Without this, office
 * approval happens silently and the driver has no idea they can start working.
 *
 * A driver who signed up days ago is nearly always outside WhatsApp's 24h
 * window by the time the office approves them, so the approval must fall back
 * to a template the same way leads do.
 */
export async function notifyDriverOfApproval(
  driverId: string,
  action: 'approve' | 'reject' | 'suspend',
): Promise<void> {
  const driver = await getDriverById(driverId);
  if (!driver) return;
  const lang = langOf(driver.preferred_language);

  if (action === 'approve') {
    if (inWhatsAppWindow(driver.last_reply_at)) {
      await send(driver.phone, 'driver', tpl.kycVerified(lang), { sessionState: 'idle' });
      return;
    }
    const settings = await getSettings();
    await sendTemplate(
      driver.phone,
      settings.kyc_approved_template,
      langCode(lang),
    );
    return;
  }

  // Rejection carries the helpline and expects the driver to call us, so it
  // stays free-form: it is only ever sent right after office action.
  await send(
    driver.phone,
    'driver',
    tpl.kycRejected(lang, (await getSettings()).helpline ?? '-'),
    { sessionState: 'idle' },
  );
}
