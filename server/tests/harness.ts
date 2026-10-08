import { setTransport, setTemplateTransport } from '../src/whatsapp/api';
import type { TemplatePayload } from '../src/whatsapp/api';
import { setGeocoder } from '../src/lib/geocode';
import type { OutMessage } from '../src/whatsapp/spec';
import { handleRiderMessage } from '../src/state/flows/rider';
import { handleDriverMessage } from '../src/state/flows/driver';
import { supabaseAdmin } from '../src/supabase/client';
import { config } from '../src/config';
import { upsertSession, type Role } from '../src/state/store';
import { clearSettingsCache } from '../src/state/queries';

// ── Types ──

export interface CapturedMessage {
  idx: number;
  to: string;
  msg: OutMessage;
}

export interface RiderInput {
  text?: string;
  location?: { lat: number; lng: number };
}

export interface DriverInput {
  text?: string;
  location?: { lat: number; lng: number };
  imageUrl?: string;
}

// ── Capture ──

export const messageLog: CapturedMessage[] = [];
let msgIdx = 0;

export function resetCapture(): void {
  messageLog.length = 0;
  msgIdx = 0;
}

/** The replacement sendMessage. Used by vitest (vi.mock) and by the CLI. */
export function makeMockSendMessage(): (to: string, msg: OutMessage) => Promise<Response> {
  return async (to: string, msg: OutMessage): Promise<Response> => {
    messageLog.push({ idx: msgIdx++, to, msg });
    return { ok: true, status: 200 } as unknown as Response;
  };
}

export const templateLog: TemplatePayload[] = [];

/** The replacement template sender. Nothing reaches Meta. */
export function makeMockSendTemplate(): (payload: TemplatePayload) => Promise<Response> {
  return async (payload: TemplatePayload): Promise<Response> => {
    templateLog.push(payload);
    return {
      ok: true,
      status: 200,
      clone: () => ({ json: async () => ({ messages: [{ id: `wamid.test.${templateLog.length}` }] }) }),
    } as unknown as Response;
  };
}

export function resetTemplateCapture(): void {
  templateLog.length = 0;
}

export const TEST_ADDRESS = 'Gandhi Circle, Hosapete';

export function installMock(): void {
  resetCapture();
  resetTemplateCapture();
  setTransport(makeMockSendMessage());
  setTemplateTransport(makeMockSendTemplate());
  // Deterministic, offline: no test should depend on a geocoding provider.
  setGeocoder(async () => TEST_ADDRESS);
}

// ── Phones ──

export const RIDER_PHONE = '+919999000001';
export const DRIVER_A_PHONE = '+919999000002';
export const DRIVER_B_PHONE = '+919999000003';
export const DRIVER_C_PHONE = '+919999000004';

export const PICKUP = { lat: 12.9716, lng: 77.5946 };
export const DROP = { lat: 12.98, lng: 77.6 };

// ── Steps ──

async function ensureRole(phone: string, role: Role): Promise<void> {
  await upsertSession(phone, { role });
}

export async function riderStep(input: RiderInput): Promise<void> {
  await riderStepAs(RIDER_PHONE, input);
}

export async function riderStepAs(phone: string, input: RiderInput): Promise<void> {
  await ensureRole(phone, 'rider');
  await handleRiderMessage(phone, input);
}

export async function driverStep(phone: string, input: DriverInput): Promise<void> {
  await ensureRole(phone, 'driver');
  await handleDriverMessage(phone, input);
}

/** Put a phone at the start of the signup funnel, as the webhook would. */
export async function startAsNewRider(phone: string): Promise<void> {
  await upsertSession(phone, { role: 'rider', state: 'awaiting_name', data: {} });
}

export async function startAsNewDriver(phone: string): Promise<void> {
  await upsertSession(phone, { role: 'driver', state: 'awaiting_driver_name', data: {} });
}

// ── Finders ──

export function findButtonId(prefix: string, toPhone?: string): string | undefined {
  for (let i = messageLog.length - 1; i >= 0; i--) {
    const m = messageLog[i];
    if (toPhone && m.to !== toPhone) continue;
    const msg = m.msg;
    if (msg.kind === 'buttons') {
      for (const b of msg.buttons) if (b.id.startsWith(prefix)) return b.id;
    }
    if (msg.kind === 'list') {
      for (const s of msg.sections) {
        for (const r of s.rows) if (r.id.startsWith(prefix)) return r.id;
      }
    }
  }
  return undefined;
}

/** Like findButtonId, but only looks at messages from index `since` onwards. */
export function findButtonIdSince(
  prefix: string,
  toPhone: string,
  since: number,
): string | undefined {
  for (let i = messageLog.length - 1; i >= since; i--) {
    const m = messageLog[i];
    if (m.to !== toPhone) continue;
    const msg = m.msg;
    if (msg.kind === 'buttons') {
      for (const b of msg.buttons) if (b.id.startsWith(prefix)) return b.id;
    }
    if (msg.kind === 'list') {
      for (const s of msg.sections) {
        for (const r of s.rows) if (r.id.startsWith(prefix)) return r.id;
      }
    }
  }
  return undefined;
}

export function messagesTo(phone: string): CapturedMessage[] {
  return messageLog.filter((m) => m.to === phone);
}

export function messagesSince(n: number): CapturedMessage[] {
  return messageLog.slice(n);
}

export function lastMessage(): CapturedMessage | undefined {
  return messageLog[messageLog.length - 1];
}

export function bodyOf(m: CapturedMessage): string {
  return m.msg.kind === 'location' ? `${m.msg.lat},${m.msg.lng}` : m.msg.body;
}

// ── State ──

export async function stateOf(
  phone: string,
): Promise<{ state: string; role: Role | null; data: Record<string, unknown> } | null> {
  const { data } = await supabaseAdmin
    .from('conversation_sessions')
    .select('state, role, data')
    .eq('phone', phone)
    .maybeSingle();
  return (data as { state: string; role: Role | null; data: Record<string, unknown> } | null) ?? null;
}

// ── DB ──

function assertDestructiveAllowed(): void {
  if (!config.allowDestructiveTests) {
    throw new Error(
      'truncateAll() is destructive. Set ALLOW_DESTRUCTIVE_TESTS=true in .env to run tests.',
    );
  }
  // The client must be pointed at a dedicated TEST project, not the live one.
  // Without this, a routine `npm test` wipes real riders, drivers and trips -
  // which is exactly how a live session gets deleted mid-conversation.
  if (!config.testSupabaseUrl || config.supabaseUrl !== config.testSupabaseUrl) {
    throw new Error(
      'Refusing to wipe the database: tests must run against a dedicated TEST project.\n' +
        'Create a throwaway Supabase project (or a dev branch) and set\n' +
        'TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY in .env.\n' +
        'Tests then use those credentials automatically under NODE_ENV=test and\n' +
        'never touch SUPABASE_URL.',
    );
  }
}

/**
 * Children before parents - conversation_sessions.current_trip_id references
 * trips, so sessions must go first or the trips delete is rejected by the FK
 * and silently does nothing.
 */
async function setSetting(patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from('settings').update(patch).eq('id', true);
  if (error) throw new Error(`setSetting failed: ${error.message}`);
  clearSettingsCache();
}

export async function setAutoPickCheapest(value: boolean): Promise<void> {
  await setSetting({ auto_pick_cheapest: value });
}

export async function setFareCheck(value: boolean): Promise<void> {
  await setSetting({ fare_check_enabled: value });
}

/** Scheduling is off by default; suites that exercise it must turn it on. */
export async function setScheduling(value: boolean): Promise<void> {
  await setSetting({ scheduling_enabled: value });
}

/** Staged-dispatch knobs for a test. */
export async function setStaging(opts: {
  size?: number;
  intervalMinutes?: number;
  expandBelow?: number;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (opts.size !== undefined) patch.lead_stage_size = opts.size;
  if (opts.intervalMinutes !== undefined) patch.lead_stage_interval_minutes = opts.intervalMinutes;
  if (opts.expandBelow !== undefined) patch.lead_stage_expand_below = opts.expandBelow;
  await setSetting(patch);
}

export async function setTemplateCap(value: number): Promise<void> {
  await setSetting({ template_leads_per_driver_per_day: value });
}

export async function setWarmBand(value: number): Promise<void> {
  await setSetting({ lead_warm_band_km: value });
}

export async function setHelpline(value: string | null): Promise<void> {
  await setSetting({ helpline: value });
}

export async function setOfficeNumber(value: string | null): Promise<void> {
  await setSetting({ office_number: value });
}

export async function truncateAll(): Promise<void> {
  assertDestructiveAllowed();
  const ZERO = '00000000-0000-0000-0000-000000000000';
  const wipe = async (table: string, column: string, value: string): Promise<void> => {
    const { error } = await supabaseAdmin.from(table).delete().neq(column, value);
    if (error) throw new Error(`truncateAll failed on ${table}: ${error.message}`);
  };
    await wipe('help_requests', 'id', ZERO);
    await wipe('role_overrides', 'phone', '__dummy__');
    await wipe('bot_messages', 'id', ZERO);
  await wipe('events', 'id', ZERO);
  await wipe('ratings', 'id', ZERO);
  await wipe('trip_otps', 'trip_id', ZERO);
  await wipe('lead_dispatches', 'id', ZERO);
  await wipe('quotes', 'id', ZERO);
  await wipe('subscriptions', 'id', ZERO);
  await wipe('conversation_sessions', 'phone', '__dummy__');
  await wipe('trips', 'id', ZERO);
  // Rollups reference drivers with a plain FK, so they must go before the
  // parent or the drivers delete is rejected and silently leaves rows behind.
  await wipe('driver_daily', 'driver_id', ZERO);
  await wipe('route_daily', 'cell', '__dummy__');
  await wipe('daily_summary', 'day', '1900-01-01');
  await wipe('drivers', 'phone', '__dummy__');
  await wipe('riders', 'phone', '__dummy__');
}

export async function seedRider(phone = RIDER_PHONE, name = 'Sita'): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('riders')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (existing) {
    await upsertSession(phone, { role: 'rider', state: 'idle' });
    return (existing as { id: string }).id;
  }
  const { data } = await supabaseAdmin
    .from('riders')
    .insert({ id: crypto.randomUUID(), phone, name, preferred_language: 'english' })
    .select('id')
    .single();
  await upsertSession(phone, { role: 'rider', state: 'idle' });
  return (data as { id: string }).id;
}

export async function seedDriver(
  phone: string,
  opts: {
    name?: string;
    vehicle?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    approved?: boolean;
    subscriptionUntil?: string | null;
    language?: string;
    /** WhatsApp only delivers free-form within 24h of this. */
    lastReplyAt?: string | null;
  } = {},
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('drivers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (existing) {
    await upsertSession(phone, { role: 'driver', state: 'idle' });
    return (existing as { id: string }).id;
  }
  const { data } = await supabaseAdmin
    .from('drivers')
    .insert(
      {
        id: crypto.randomUUID(),
        phone,
        name: opts.name ?? 'Driver',
        vehicle_no: opts.vehicle ?? 'KA-05-1234',
        base_lat: opts.lat ?? PICKUP.lat,
        base_lng: opts.lng ?? PICKUP.lng,
        radius_km: opts.radiusKm ?? 5,
        approval_status: opts.approved === false ? 'pending' : 'approved',
        preferred_language: opts.language ?? 'kannada',
        last_reply_at:
          opts.lastReplyAt === null ? null : opts.lastReplyAt ?? new Date().toISOString(),
        subscription_until:
          opts.subscriptionUntil === null
            ? null
            : opts.subscriptionUntil ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
    )
    .select('id')
    .single();
  await upsertSession(phone, { role: 'driver', state: 'idle' });
  return (data as { id: string }).id;
}

/** Full rider booking path: pickup -> drop -> book now. Returns the trip id. */
export async function postTrip(
  pickup: { lat: number; lng: number } = PICKUP,
  drop: { lat: number; lng: number } = DROP,
): Promise<string> {
  await riderStep({ text: 'auto' });
  await riderStep({ location: pickup });
  await riderStep({ location: drop });
  await riderStep({ text: 'book_now' });
  const s = await stateOf(RIDER_PHONE);
  return s?.data?.pending_trip_id as string;
}

// ── Renderer ──

export function renderLog(): string {
  const out: string[] = [];
  for (const m of messageLog) {
    const head = `[${m.idx}] -> ${m.to}`;
    if (m.msg.kind === 'text') {
      out.push(`${head} TEXT\n  ${m.msg.body}`);
    } else if (m.msg.kind === 'location_request') {
      out.push(`${head} LOCATION REQUEST\n  ${m.msg.body}`);
    } else if (m.msg.kind === 'buttons') {
      out.push(`${head} BUTTONS\n  ${m.msg.body}`);
      for (const b of m.msg.buttons) out.push(`    [${b.title}] -> ${b.id}`);
    } else if (m.msg.kind === 'list') {
      out.push(`${head} LIST\n  ${m.msg.body}`);
      for (const s of m.msg.sections) {
        for (const r of s.rows) out.push(`    - ${r.title} -> ${r.id}`);
      }
    } else {
      out.push(`${head} LOCATION ${m.msg.lat},${m.msg.lng}`);
    }
  }
  return out.join('\n');
}
