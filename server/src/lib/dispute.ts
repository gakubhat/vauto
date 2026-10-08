import { recordEvent } from './events';
import { send } from './send';
import { getRiderById, type Trip } from '../state/queries';
import { langOf } from '../whatsapp/i18n';
import * as tpl from '../whatsapp/templates';

/**
 * The office has ruled on a disputed trip: record it (auditable, and shown on
 * Trip Detail) and tell the rider, who is otherwise left wondering and blocked
 * from booking again. Free-form, so it only lands inside the 24h window - the
 * office is usually replying to a recent dispute, which is the same window.
 */
export async function resolveDispute(
  trip: Trip,
  outcome: 'completed' | 'cancelled',
  note: string,
): Promise<void> {
  recordEvent('dispute_resolved', {
    actorRole: 'office',
    tripId: trip.id,
    properties: { outcome, note: note || null },
  });

  const rider = await getRiderById(trip.rider_id);
  if (!rider) return;
  await send(rider.phone, 'rider', tpl.disputeResolved(langOf(rider.preferred_language)), {
    sessionState: 'idle',
    tripId: trip.id,
  });
}
