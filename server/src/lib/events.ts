import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../supabase/client';

export type ActorRole = 'rider' | 'driver' | 'office' | 'system';

/**
 * Append-only analytics event. Fire and forget - never await this in the
 * message path, and never let a logging failure break a flow.
 */
export function recordEvent(
  type: string,
  opts: {
    actorRole: ActorRole;
    actorId?: string | null;
    tripId?: string | null;
    properties?: Record<string, unknown>;
  },
): void {
  void supabaseAdmin
    .from('events')
    .insert({
      id: uuid(),
      type,
      actor_role: opts.actorRole,
      actor_id: opts.actorId ?? null,
      trip_id: opts.tripId ?? null,
      properties: opts.properties ?? {},
    })
    .then(({ error }) => {
      if (error) console.error('[EVENT ERROR]', type, error.message);
    });
}

export function logMessage(entry: {
  phone: string;
  direction: 'inbound' | 'outbound';
  role: 'rider' | 'driver';
  messageType: string;
  body: string;
  tripId?: string | null;
  sessionState?: string | null;
  rawPayload?: Record<string, unknown>;
}): void {
  void supabaseAdmin
    .from('bot_messages')
    .insert({
      id: uuid(),
      phone: entry.phone,
      direction: entry.direction,
      role: entry.role,
      message_type: entry.messageType,
      body: entry.body,
      trip_id: entry.tripId ?? null,
      session_state: entry.sessionState ?? null,
      raw_payload: entry.rawPayload ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('[MESSAGE LOG ERROR]', error.message);
    });
}
