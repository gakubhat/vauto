import { langOf } from '../whatsapp/i18n';
import { send } from '../lib/send';
import * as tpl from '../whatsapp/templates';
import { getDriverById } from '../state/queries';

/**
 * Tell a driver the outcome of their KYC review. Without this, office
 * approval happens silently and the driver has no idea they can start working.
 */
export async function notifyDriverOfApproval(
  driverId: string,
  action: 'approve' | 'reject' | 'suspend',
): Promise<void> {
  const driver = await getDriverById(driverId);
  if (!driver) return;
  const lang = langOf(driver.preferred_language);
  const msg =
    action === 'approve'
      ? tpl.kycVerified(lang)
      : action === 'reject'
        ? tpl.kycRejected(lang)
        : tpl.kycRejected(lang);
  await send(driver.phone, 'driver', msg, { sessionState: 'idle' });
}
