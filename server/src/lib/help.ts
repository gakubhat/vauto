import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../supabase/client';
import { recordEvent } from './events';
import { getSettings } from '../state/queries';
import { send } from './send';

export type HelpSource = 'help' | 'dispute';

/** Digits only, so '+91 94482 67561' and '919448267561' compare equal. */
export function normalisePhone(p: string | null | undefined): string {
  return (p ?? '').replace(/\D/g, '');
}

/**
 * Tell the office a person is waiting.
 *
 * Without this the request is just a row: the queue works, the dashboard
 * counter is accurate, and nobody ever looks. The bot promises "our office will
 * help you", so something has to actually reach a human.
 *
 * Sent once per *opened* request - `openHelpRequest` is idempotent per phone,
 * so a panicking user tapping "help" does not spam the office.
 *
 * Free-form today. Outside WhatsApp's 24h window this will be dropped by Meta;
 * see the office_alert template TODO in docs/overview.md.
 */
async function notifyOffice(opts: {
  source: HelpSource;
  role: 'rider' | 'driver';
  phone: string;
  name: string | null;
  tripId: string | null;
  reason?: string | null;
}): Promise<void> {
  const settings = await getSettings();
  const office = settings.office_number;
  if (!office) return;

  // Never alert the office about the office.
  if (normalisePhone(office) === normalisePhone(opts.phone)) return;

  const urgent = opts.source === 'dispute';
  const who = opts.name ? `${opts.name} (${opts.role})` : opts.role;
  const lines = [
    urgent ? '🔴 Dispute — needs the office' : '🔔 Help needed',
    `${who} ${opts.phone}`,
    opts.tripId ? `Trip ${opts.tripId.slice(0, 8)}` : null,
    opts.reason ? `Reason: ${opts.reason}` : null,
    'Open the admin → Help',
  ].filter(Boolean);

  try {
    // Office is neither rider nor driver; 'rider' is the log label only.
    await send(office, 'rider', { kind: 'text', body: lines.join('\n') }, {
      tripId: opts.tripId,
    });
  } catch (e) {
    // A failed alert must not break the user's flow - they still get their reply.
    console.error('[OFFICE ALERT FAILED]', office, (e as Error).message);
  }
}

/**
 * A person asked for a human. Idempotent per phone: a second "help" while one is
 * still open does not bury the office in duplicates - it is the same person
 * waiting. A **dispute** outranks a plain help request, though, so it escalates
 * the open row to `dispute` and alerts the office once instead of being
 * swallowed by the one-open-request rule. Returns the request id, or null if
 * the write failed.
 */
export async function openHelpRequest(opts: {
  phone: string;
  role: 'rider' | 'driver';
  source: HelpSource;
  reason?: string | null;
  tripId?: string | null;
  name?: string | null;
}): Promise<string | null> {
  const { phone, role, source, reason, tripId, name } = opts;

  const { data: existing } = await supabaseAdmin
    .from('help_requests')
    .select('id, source, trip_id')
    .eq('phone', phone)
    .is('closed_at', null)
    .maybeSingle();
  if (existing) {
    const row = existing as { id: string; source: HelpSource; trip_id: string | null };
    if (source === 'dispute' && row.source !== 'dispute') {
      const patch: Record<string, unknown> = { source: 'dispute' };
      if (reason) patch.reason = reason;
      if (!row.trip_id && tripId) patch.trip_id = tripId;
      const { error } = await supabaseAdmin.from('help_requests').update(patch).eq('id', row.id);
      if (error) {
        console.error('[HELP ESCALATE ERROR]', phone, error.message);
        return row.id;
      }
      recordEvent('help_requested', {
        actorRole: role,
        tripId: tripId ?? row.trip_id ?? null,
        properties: { source, reason: reason ?? null, escalated: true },
      });
      await notifyOffice({
        source,
        role,
        phone,
        name: name ?? null,
        tripId: tripId ?? row.trip_id ?? null,
        reason,
      });
    }
    return row.id;
  }

  const id = uuid();
  const { error } = await supabaseAdmin.from('help_requests').insert({
    id,
    phone,
    role,
    source,
    reason: reason ?? null,
    trip_id: tripId ?? null,
  });
  if (error) {
    console.error('[HELP REQUEST ERROR]', phone, error.message);
    return null;
  }

  recordEvent('help_requested', {
    actorRole: role,
    tripId: tripId ?? null,
    properties: { source, reason: reason ?? null },
  });

  // After the row is committed, so the office can always find what it was told.
  await notifyOffice({ source, role, phone, name: name ?? null, tripId: tripId ?? null, reason });

  return id;
}
