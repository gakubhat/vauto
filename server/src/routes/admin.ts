import express, { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { supabaseAdmin } from '../supabase/client';
import {
  clearRoleOverride,
  clearSettingsCache,
  ensureDriver,
  ensureRider,
  getRoleOverride,
  getTrip,
  setRoleOverride,
} from '../state/queries';
import { reopenTrip } from '../lib/matching';
import { deleteDriverCompletely, deleteRiderCompletely } from '../lib/delete-user';
import { notifyDriverOfApproval } from '../lib/notify-driver';
import { resolveDispute } from '../lib/dispute';
import { buildSettingsPatch } from '../lib/settings';
import { signedUrl } from '../lib/storage';
import { addKycDocument, requestKycDocuments } from '../lib/kyc';
import { recordEvent } from '../lib/events';
import { deleteSession, resetSession } from '../state/store';
import { UnauthorizedError } from '../lib/errors';

export const adminRouter = Router();

function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new UnauthorizedError('Invalid token'));
  }
}

adminRouter.post('/login', (req: Request, res: Response) => {
  const { phone, password } = req.body as { phone?: string; password?: string };
  if (phone !== config.adminPhone || password !== config.adminPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ phone }, config.jwtSecret, { expiresIn: '12h' });
  res.json({ token });
});

adminRouter.get('/me', authenticate, (_req: Request, res: Response) => {
  res.json({ phone: config.adminPhone, allowAdminDelete: config.allowAdminDelete });
});

function assertDeleteAllowed(): void {
  if (!config.allowAdminDelete) {
    throw new UnauthorizedError(
      'User deletion is disabled. Set ALLOW_ADMIN_DELETE=true to enable it.',
    );
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────

adminRouter.get('/stats', authenticate, async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const count = async (table: string, filter?: [string, unknown]): Promise<number> => {
    let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
    if (filter) q = q.eq(filter[0], filter[1] as never);
    const { count: n } = await q;
    return n ?? 0;
  };

  const { data: tripsToday } = await supabaseAdmin
    .from('trips')
    .select('id, status, first_quote_at, created_at')
    .gte('created_at', since);

  const rows = (tripsToday ?? []) as Array<{
    id: string;
    status: string;
    first_quote_at: string | null;
    created_at: string;
  }>;
  const quoted = rows.filter((r) => r.first_quote_at);
  const timesToFirstQuote = quoted
    .map((r) => new Date(r.first_quote_at as string).getTime() - new Date(r.created_at).getTime())
    .sort((a, b) => a - b);
  const median = timesToFirstQuote.length
    ? timesToFirstQuote[Math.floor(timesToFirstQuote.length / 2)]
    : null;

  res.json({
    trips_today: rows.length,
    completed_today: rows.filter((r) => r.status === 'completed').length,
    expired_today: rows.filter((r) => r.status === 'expired').length,
    unclaimed_rate: rows.length
      ? Math.round((rows.filter((r) => !r.first_quote_at).length / rows.length) * 100)
      : 0,
    median_seconds_to_first_quote: median === null ? null : Math.round(median / 1000),
    pending_kyc: await count('drivers', ['approval_status', 'pending']),
    active_drivers: await count('drivers', ['approval_status', 'approved']),
    disputed_open: await count('trips', ['status', 'disputed']),
    help_open: await countOpenHelp(),
    riders_total: await count('riders'),
  });
});

async function countOpenHelp(): Promise<number> {
  const { count: n } = await supabaseAdmin
    .from('help_requests')
    .select('id', { count: 'exact', head: true })
    .is('closed_at', null);
  return n ?? 0;
}

// ── Drivers ────────────────────────────────────────────────────────────

adminRouter.get('/drivers', authenticate, async (req: Request, res: Response) => {
  const { approval, subscription, q } = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin.from('drivers').select('*').order('created_at', { ascending: false });
  if (approval) query = query.eq('approval_status', approval);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,vehicle_no.ilike.%${q}%`);
  const { data } = await query;
  let rows = (data ?? []) as Array<Record<string, unknown>>;
  if (subscription === 'active') {
    rows = rows.filter(
      (r) => !r.subscription_until || new Date(r.subscription_until as string) > new Date(),
    );
  }
  if (subscription === 'lapsed') {
    rows = rows.filter(
      (r) => r.subscription_until && new Date(r.subscription_until as string) <= new Date(),
    );
  }
  res.json(rows);
});

adminRouter.post('/drivers', authenticate, async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const row = {
    id: uuid(),
    phone: b.phone as string,
    name: (b.name as string) ?? null,
    vehicle_no: (b.vehicle_no as string) ?? null,
    base_lat: (b.base_lat as number) ?? null,
    base_lng: (b.base_lng as number) ?? null,
    base_text: (b.base_text as string) ?? null,
    radius_km: (b.radius_km as number) ?? config.defaultRadiusKm,
    approval_status: (b.approval_status as string) ?? 'approved',
    kyc_verified_by: config.adminPhone,
    kyc_verified_at: new Date().toISOString(),
    subscription_until:
      (b.subscription_until as string) ??
      new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
  const { data, error } = await supabaseAdmin.from('drivers').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

adminRouter.get('/drivers/:id', authenticate, async (req: Request, res: Response) => {
  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (!driver) return res.status(404).json({ error: 'Not found' });

  const { data: trips } = await supabaseAdmin
    .from('trips')
    .select('*')
    .eq('driver_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(50);
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('driver_id', req.params.id)
    .order('paid_at', { ascending: false });
  const { data: dispatches } = await supabaseAdmin
    .from('lead_dispatches')
    .select('id')
    .eq('driver_id', req.params.id);
  const { data: quotes } = await supabaseAdmin
    .from('quotes')
    .select('id, status')
    .eq('driver_id', req.params.id);

  const leads = (dispatches ?? []).length;
  const sent = (quotes ?? []).length;
  const won = (quotes ?? []).filter((q) => q.status === 'accepted').length;

  // The kyc bucket is private - hand the UI signed URLs, not public ones.
  const kycUrls = {
    kyc_aadhaar_url: await signedUrl((driver as Record<string, unknown>).kyc_aadhaar_url as string, config.storageBucketKyc),
    kyc_aadhaar_back_url: await signedUrl((driver as Record<string, unknown>).kyc_aadhaar_back_url as string, config.storageBucketKyc),
    kyc_selfie_url: await signedUrl((driver as Record<string, unknown>).kyc_selfie_url as string, config.storageBucketKyc),
  };

  res.json({
    ...driver,
    ...kycUrls,
    role_override: await getRoleOverride((driver as { phone: string }).phone),
    trips: trips ?? [],
    subscriptions: subs ?? [],
    metrics: {
      leads_sent: leads,
      quotes_sent: sent,
      quotes_won: won,
      response_rate: leads ? Math.round((sent / leads) * 100) : 0,
    },
  });
});

adminRouter.patch('/drivers/:id', authenticate, async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const allowed = [
    'name', 'vehicle_no', 'aadhaar_no', 'vehicle_verified',
    'base_lat', 'base_lng', 'base_text', 'radius_km',
    'preferred_language',
  ];
  if ('preferred_language' in b && b.preferred_language !== 'kannada' && b.preferred_language !== 'english') {
    return res.status(400).json({ error: "preferred_language must be 'kannada' or 'english'" });
  }
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) patch[k] = b[k];
  if (patch.vehicle_verified === true) patch.vehicle_verified_at = new Date().toISOString();
  if (patch.vehicle_verified === false) patch.vehicle_verified_at = null;
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

adminRouter.post('/drivers/:id/approval', authenticate, async (req: Request, res: Response) => {
  const { action } = req.body as { action?: string };
  if (!['approve', 'reject', 'suspend'].includes(action ?? '')) {
    return res.status(400).json({ error: 'action must be approve, reject or suspend' });
  }
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'suspended' : 'suspended';
  const patch: Record<string, unknown> = { approval_status: status };
  if (action === 'approve') {
    patch.kyc_verified_by = config.adminPhone;
    patch.kyc_verified_at = new Date().toISOString();
    patch.trial_ends_at = new Date(Date.now() + 30 * 86_400_000).toISOString();
    patch.subscription_until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  }
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  await notifyDriverOfApproval(String(req.params.id), action as 'approve' | 'reject' | 'suspend');
  res.json(data);
});

/**
 * Office uploads a KYC document the driver skipped (or replaces a poor one).
 *
 * The image is the raw request body - one file per request - so no multipart
 * parser is needed. `express.raw` only buffers the accepted image types.
 */
adminRouter.post(
  '/drivers/:id/kyc/:slot',
  authenticate,
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    limit: '6mb',
  }),
  async (req: Request, res: Response) => {
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
      return res.status(400).json({ error: 'send the image as the raw request body' });
    }
    const driverId = String(req.params.id);
    const slot = String(req.params.slot);
    const mime = String(req.header('content-type') ?? '').split(';')[0].trim();
    const result = await addKycDocument(driverId, slot, buffer, mime);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    recordEvent('kyc_uploaded', {
      actorRole: 'office',
      actorId: config.adminPhone,
      properties: { driver_id: driverId, slot },
    });
    res.json({ ok: true });
  },
);

/** Ask the driver to (re)send their documents over WhatsApp. */
adminRouter.post('/drivers/:id/request-kyc', authenticate, async (req: Request, res: Response) => {
  const driverId = String(req.params.id);
  const result = await requestKycDocuments(driverId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  recordEvent('kyc_requested', {
    actorRole: 'office',
    actorId: config.adminPhone,
    properties: { driver_id: driverId },
  });
  res.json({ ok: true });
});

adminRouter.post('/drivers/:id/subscription', authenticate, async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const validUntil = (b.valid_until as string) ?? new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error: subError } = await supabaseAdmin.from('subscriptions').insert({
    id: uuid(),
    driver_id: req.params.id,
    paid_amount_paise: b.paid_amount_paise as number,
    paid_via: (b.paid_via as string) ?? 'cash',
    valid_until: validUntil,
    recorded_by: config.adminPhone,
  });
  if (subError) return res.status(400).json({ error: subError.message });
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .update({ subscription_until: validUntil })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/**
 * Force a phone onto one flow, or clear the override ("auto").
 *
 * Setting the role only in the session is not enough: the session is deleted by
 * the 24h cleanup and role resolution falls back to the tables, flipping the
 * person back. So the choice is stored in `role_overrides`, which resolution
 * consults first, and the target row is created so the flow has a record.
 */
async function applyRoleOverride(
  phone: string,
  role: string,
): Promise<{ ok: true; note: string }> {
  if (role === 'auto') {
    await clearRoleOverride(phone);
    await deleteSession(phone);
    return { ok: true, note: 'Override cleared; the role resolves from the tables again.' };
  }
  if (role !== 'rider' && role !== 'driver') {
    throw new Error('role must be rider, driver or auto');
  }
  await setRoleOverride(phone, role, config.adminPhone);
  if (role === 'driver') await ensureDriver(phone);
  else await ensureRider(phone);
  await deleteSession(phone);
  return { ok: true, note: `Role pinned to ${role}. The next message is handled as ${role}.` };
}

adminRouter.post('/drivers/:id/role', authenticate, async (req: Request, res: Response) => {
  const { role } = req.body as { role?: string };
  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('phone')
    .eq('id', req.params.id)
    .single();
  if (!driver) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await applyRoleOverride((driver as { phone: string }).phone, role ?? '');
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

adminRouter.post('/riders/:id/role', authenticate, async (req: Request, res: Response) => {
  const { role } = req.body as { role?: string };
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('phone')
    .eq('id', req.params.id)
    .single();
  if (!rider) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await applyRoleOverride((rider as { phone: string }).phone, role ?? '');
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

adminRouter.delete('/drivers/:id', authenticate, async (req: Request, res: Response) => {
  try {
    assertDeleteAllowed();
  } catch (e) {
    return res.status(403).json({ error: (e as Error).message });
  }
  try {
    const result = await deleteDriverCompletely(String(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── Riders ─────────────────────────────────────────────────────────────

adminRouter.get('/riders', authenticate, async (req: Request, res: Response) => {
  const { q } = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin.from('riders').select('*').order('created_at', { ascending: false });
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data } = await query;
  res.json(data ?? []);
});

adminRouter.get('/riders/:id', authenticate, async (req: Request, res: Response) => {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (!rider) return res.status(404).json({ error: 'Not found' });
  const { data: trips } = await supabaseAdmin
    .from('trips')
    .select('*')
    .eq('rider_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(50);
  res.json({
    ...rider,
    role_override: await getRoleOverride((rider as { phone: string }).phone),
    trips: trips ?? [],
  });
});

adminRouter.patch('/riders/:id', authenticate, async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const allowed = ['name', 'home_lat', 'home_lng', 'home_text', 'preferred_language'];
  if ('preferred_language' in b && b.preferred_language !== 'kannada' && b.preferred_language !== 'english') {
    return res.status(400).json({ error: "preferred_language must be 'kannada' or 'english'" });
  }
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) patch[k] = b[k];
  const { data, error } = await supabaseAdmin
    .from('riders')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

adminRouter.delete('/riders/:id', authenticate, async (req: Request, res: Response) => {
  try {
    assertDeleteAllowed();
  } catch (e) {
    return res.status(403).json({ error: (e as Error).message });
  }
  try {
    const result = await deleteRiderCompletely(String(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── Trips ──────────────────────────────────────────────────────────────

const TRIPS_PAGE_SIZE = 100;

adminRouter.get('/trips', authenticate, async (req: Request, res: Response) => {
  const { status, q, page } = req.query as Record<string, string | undefined>;
  const p = Math.max(1, Math.floor(Number(page ?? 1)) || 1);

  let query = supabaseAdmin.from('trips').select('*');
  if (status) query = query.eq('status', status);

  // Search by trip number or by the rider's name/phone. The filter must run in
  // the database, not in memory, or pagination would skip matches on later pages.
  if (q) {
    const { data: riders } = await supabaseAdmin
      .from('riders')
      .select('id')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const ids = ((riders ?? []) as Array<{ id: string }>).map((r) => r.id);
    const num = Number(q);
    const isNum = Number.isInteger(num);
    if (ids.length && isNum) {
      query = query.or(`rider_id.in.(${ids.join(',')}),trip_number.eq.${num}`);
    } else if (ids.length) {
      query = query.in('rider_id', ids);
    } else if (isNum) {
      query = query.eq('trip_number', num);
    } else {
      return res.json([]);
    }
  }

  const from = (p - 1) * TRIPS_PAGE_SIZE;
  const { data } = await query
    .order('created_at', { ascending: false })
    .range(from, from + TRIPS_PAGE_SIZE - 1);
  res.json(data ?? []);
});

adminRouter.get('/trips/:id', authenticate, async (req: Request, res: Response) => {
  const { data: trip } = await supabaseAdmin
    .from('trips')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (!trip) return res.status(404).json({ error: 'Not found' });
  const { data: quotes } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('trip_id', req.params.id);
  const { data: dispatches } = await supabaseAdmin
    .from('lead_dispatches')
    .select('*')
    .eq('trip_id', req.params.id);
  const { data: events } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('trip_id', req.params.id)
    .order('at', { ascending: true });
  const { data: messages } = await supabaseAdmin
    .from('bot_messages')
    .select('*')
    .eq('trip_id', req.params.id)
    .order('created_at', { ascending: true });
  res.json({ ...trip, quotes: quotes ?? [], dispatches: dispatches ?? [], events: events ?? [], messages: messages ?? [] });
});

adminRouter.post('/trips/:id/status', authenticate, async (req: Request, res: Response) => {
  const { status, reason, resolution_note } = req.body as {
    status?: string;
    reason?: string;
    resolution_note?: string;
  };
  const allowed = ['cancelled', 'completed', 'disputed', 'expired', 'open'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }

  const id = String(req.params.id);
  const before = await getTrip(id);
  if (!before) return res.status(404).json({ error: 'trip not found' });

  // Reopening is not a status flip: reset the trip and re-dispatch. A plain
  // flip would bring a finished trip back `open` with `leads_dispatched` still
  // set and nobody told, blocking the rider on a trip no driver can quote.
  if (status === 'open') {
    if (before.status !== 'open') {
      const ok = await reopenTrip(before);
      if (!ok) return res.status(500).json({ error: 'could not reopen trip' });
    }
    const { data } = await supabaseAdmin.from('trips').select().eq('id', id).single();
    return res.json(data);
  }

  const patch: Record<string, unknown> = { status };
  if (status === 'cancelled') {
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_by = 'office';
    patch.cancel_reason = reason ?? null;
  }
  if (status === 'completed') patch.completed_at = new Date().toISOString();
  const note = typeof resolution_note === 'string' ? resolution_note.trim().slice(0, 500) : '';
  if (note) patch.resolution_note = note;

  const { data, error } = await supabaseAdmin
    .from('trips')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Leaving `disputed` is the office's ruling. Record it (so it is auditable)
  // and tell the rider, who is otherwise left wondering and blocked.
  if (before.status === 'disputed' && (status === 'completed' || status === 'cancelled')) {
    await resolveDispute(before, status, note);
  }

  res.json(data);
});

// ── Recovery ───────────────────────────────────────────────────────────
//
// For less tech-literate users, a stuck session is indistinguishable from a
// broken bot: they send a message and nothing sensible comes back. The office
// must be able to put someone back to a known-good state without a deploy.

/**
 * Reset (or clear) one person's conversation session.
 *
 * `to: 'idle'` keeps the row but wipes `data` and `current_trip_id` - the fix
 * for a stale `pending_trip_id` or a state the flow no longer handles.
 * `to: 'clear'` deletes the row entirely, so the next message re-resolves the
 * role from `riders`/`drivers` and the signup states are skipped.
 *
 * Deliberately does NOT touch trips. A live trip is separate state, and
 * force-closing it is a decision for Trip Detail where the office can see it.
 */
adminRouter.post('/sessions/:phone/reset', authenticate, async (req: Request, res: Response) => {
  const phone = String(req.params.phone);
  const { to } = req.body as { to?: string };

  const { data: existing } = await supabaseAdmin
    .from('conversation_sessions')
    .select('phone, state, role, current_trip_id, data')
    .eq('phone', phone)
    .maybeSingle();

  const session = existing as
    | { phone: string; state: string; role: string | null; current_trip_id: string | null; data: Record<string, unknown> }
    | null;

  if (to === 'clear') {
    await deleteSession(phone);
    return res.json({
      ok: true,
      action: 'cleared',
      note: 'Session deleted. The next message re-resolves the role from the riders/drivers tables.',
      previous: session,
    });
  }

  // Default is the safe one: keep the row, wipe the volatile bits.
  await resetSession(phone, {
    state: 'idle',
    role: (session?.role as 'rider' | 'driver' | null) ?? null,
    current_trip_id: null,
    data: {},
  });
  res.json({
    ok: true,
    action: 'reset',
    note: 'State set to idle with a clean data object. The trip, if any, is untouched.',
    previous: session,
  });
});

/** Everything the office needs to diagnose one person, in one call. */
adminRouter.get('/recover/:phone', authenticate, async (req: Request, res: Response) => {
  const phone = String(req.params.phone);

  const [sessionRes, riderRes, driverRes, helpRes, override] = await Promise.all([
    supabaseAdmin.from('conversation_sessions').select('*').eq('phone', phone).maybeSingle(),
    supabaseAdmin.from('riders').select('id, name').eq('phone', phone).maybeSingle(),
    supabaseAdmin.from('drivers').select('id, name, approval_status').eq('phone', phone).maybeSingle(),
    supabaseAdmin
      .from('help_requests')
      .select('id, source, opened_at')
      .eq('phone', phone)
      .is('closed_at', null),
    getRoleOverride(phone),
  ]);

  const session = sessionRes.data as Record<string, unknown> | null;
  const rider = riderRes.data as { id: string; name: string | null } | null;
  const driver = driverRes.data as { id: string; name: string | null } | null;

  // A live trip blocks a new booking via one_active_trip_per_rider / _driver.
  // The rider is blocked by an unconfirmed `in_progress` trip and by `disputed`;
  // the driver is freed at DONE (`done_at` set) and by a dispute.
  let blockingTrip: Record<string, unknown> | null = null;
  const ownerId = rider?.id ?? driver?.id;
  if (ownerId) {
    const col = rider ? 'rider_id' : 'driver_id';
    const statuses = rider
      ? ['open', 'assigned', 'arrived', 'in_progress', 'disputed']
      : ['assigned', 'arrived', 'in_progress'];
    let blockingQuery = supabaseAdmin
      .from('trips')
      .select('id, trip_number, status, created_at')
      .eq(col, ownerId)
      .in('status', statuses);
    if (!rider) blockingQuery = blockingQuery.is('done_at', null);
    const { data } = await blockingQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    blockingTrip = (data as Record<string, unknown> | null) ?? null;
  }

  const problems: string[] = [];
  if (!session) problems.push('No session row — the row was deleted by the 24h cleanup or never created.');
  if (session && !session.role) problems.push('Session has no role — the person will be asked Rider/Driver again.');
  if (session && session.data && (session.data as Record<string, unknown>).pending_trip_id && !blockingTrip) {
    problems.push('Stale pending_trip_id with no matching live trip — cancel and status will misbehave.');
  }
  if (blockingTrip && blockingTrip.status === 'disputed') {
    problems.push('A disputed trip is blocking a new booking. Close it in Trip Detail.');
  }
  if (!rider && !driver) problems.push('Phone is in neither riders nor drivers — they will go through signup again.');

  res.json({
    phone,
    session,
    rider,
    driver,
    role_override: override,
    help_open: helpRes.data ?? [],
    blocking_trip: blockingTrip,
    problems,
    session_age_seconds: session?.updated_at
      ? Math.round((Date.now() - new Date(session.updated_at as string).getTime()) / 1000)
      : null,
  });
});

// ── Debugging surfaces ─────────────────────────────────────────────────

adminRouter.get('/sessions', authenticate, async (_req: Request, res: Response) => {
  const { data } = await supabaseAdmin
    .from('conversation_sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  res.json(data ?? []);
});

// ── Help requests ──────────────────────────────────────────────────────

/** Open requests first (oldest waiting at the top), then the recently closed. */
adminRouter.get('/help', authenticate, async (req: Request, res: Response) => {
  const { open } = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin
    .from('help_requests')
    .select('*')
    .order('opened_at', { ascending: true })
    .limit(200);
  if (open === '1') query = query.is('closed_at', null);
  const { data } = await query;
  const rows = ((data ?? []) as Array<{ closed_at: string | null; phone: string }>).sort((a, b) => {
    if (!a.closed_at && b.closed_at) return -1;
    if (a.closed_at && !b.closed_at) return 1;
    return 0;
  });

  // Attach the last couple of messages so the office has context without a
  // second click. Same transcript the Sessions page shows.
  const withContext = await Promise.all(
    rows.map(async (r) => {
      const { data: messages } = await supabaseAdmin
        .from('bot_messages')
        .select('direction, body, created_at')
        .eq('phone', r.phone)
        .order('created_at', { ascending: false })
        .limit(3);
      return { ...r, recent: (messages ?? []).reverse() };
    }),
  );
  res.json(withContext);
});

adminRouter.post('/help/:id/close', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('help_requests')
    .update({ closed_at: new Date().toISOString(), closed_by: config.adminPhone })
    .eq('id', req.params.id)
    .is('closed_at', null)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

adminRouter.post('/help/:id/reopen', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('help_requests')
    .update({ closed_at: null, closed_by: null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

adminRouter.get('/events', authenticate, async (req: Request, res: Response) => {
  const { trip_id } = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin.from('events').select('*').order('at', { ascending: false }).limit(200);
  if (trip_id) query = query.eq('trip_id', trip_id);
  const { data } = await query;
  res.json(data ?? []);
});

adminRouter.get('/messages', authenticate, async (req: Request, res: Response) => {
  const { phone } = req.query as Record<string, string | undefined>;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const { data } = await supabaseAdmin
    .from('bot_messages')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: true })
    .limit(200);
  res.json(data ?? []);
});

// ── Settings ───────────────────────────────────────────────────────────

adminRouter.get('/settings', authenticate, async (_req: Request, res: Response) => {
  const { data } = await supabaseAdmin.from('settings').select('*').eq('id', true).single();
  res.json(data);
});

adminRouter.put('/settings', authenticate, async (req: Request, res: Response) => {
  const { patch, error: validationError } = buildSettingsPatch(req.body as Record<string, unknown>);
  if (validationError) return res.status(400).json({ error: validationError });

  const { data, error } = await supabaseAdmin
    .from('settings')
    .update(patch)
    .eq('id', true)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  clearSettingsCache();
  res.json(data);
});

// ── Analytics ──────────────────────────────────────────────────────────

adminRouter.get('/analytics/funnel', authenticate, async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: trips } = await supabaseAdmin
    .from('trips')
    .select('id, status, first_quote_at, assigned_at, completed_at')
    .gte('created_at', since);
  const rows = (trips ?? []) as Array<Record<string, string | null>>;
  const total = rows.length;
  res.json({
    trips: total,
    got_quote: rows.filter((r) => r.first_quote_at).length,
    assigned: rows.filter((r) => r.assigned_at).length,
    completed: rows.filter((r) => r.completed_at).length,
    unclaimed: rows.filter((r) => !r.first_quote_at).length,
  });
});

adminRouter.get('/analytics/drivers', authenticate, async (req: Request, res: Response) => {
  const { days } = req.query as Record<string, string | undefined>;
  const window = Math.min(Math.max(Number(days ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - window * 86_400_000).toISOString();

  const { data: drivers } = await supabaseAdmin
    .from('drivers')
    .select('id, name, phone, vehicle_no, approval_status, subscription_until, rating_avg')
    .eq('approval_status', 'approved');
  const { data: dispatches } = await supabaseAdmin
    .from('lead_dispatches')
    .select('driver_id')
    .gte('sent_at', since);
  const { data: quotes } = await supabaseAdmin
    .from('quotes')
    .select('driver_id, status')
    .gte('created_at', since);

  const leadsBy = new Map<string, number>();
  for (const d of (dispatches ?? []) as Array<{ driver_id: string }>) {
    leadsBy.set(d.driver_id, (leadsBy.get(d.driver_id) ?? 0) + 1);
  }
  const quotesBy = new Map<string, number>();
  for (const q of (quotes ?? []) as Array<{ driver_id: string; status: string }>) {
    quotesBy.set(q.driver_id, (quotesBy.get(q.driver_id) ?? 0) + 1);
  }

  const rows = ((drivers ?? []) as Array<Record<string, unknown>>).map((d) => {
    const id = d.id as string;
    const leads = leadsBy.get(id) ?? 0;
    const sent = quotesBy.get(id) ?? 0;
    return {
      id,
      name: d.name,
      phone: d.phone,
      vehicle_no: d.vehicle_no,
      rating_avg: d.rating_avg,
      leads_sent: leads,
      quotes_sent: sent,
      response_rate: leads ? Math.round((sent / leads) * 100) : 0,
    };
  });
  rows.sort((a, b) => b.response_rate - a.response_rate);
  res.json(rows);
});

adminRouter.get('/analytics/rollups', authenticate, async (req: Request, res: Response) => {
  const { days } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Number(days ?? 7), 90);
  const { data } = await supabaseAdmin
    .from('daily_summary')
    .select('*')
    .order('day', { ascending: false })
    .limit(limit);
  res.json(data ?? []);
});

adminRouter.post('/analytics/rollup', authenticate, async (req: Request, res: Response) => {
  const { day } = req.body as { day?: string };
  const target = day ?? new Date().toISOString().slice(0, 10);
  const { error } = await supabaseAdmin.rpc('v3_rollup_day', { p_day: target });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, day: target });
});

adminRouter.get('/analytics/areas', authenticate, async (req: Request, res: Response) => {
  const { days } = req.query as Record<string, string | undefined>;
  const window = Math.min(Math.max(Number(days ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - window * 86_400_000).toISOString();
  const { data: trips } = await supabaseAdmin
    .from('trips')
    .select('id, status, pickup_lat, pickup_lng')
    .gte('created_at', since);
  const rows = (trips ?? []) as Array<{
    id: string;
    status: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
  }>;
  const byCell = new Map<string, { trips: number; unclaimed: number }>();
  for (const t of rows) {
    if (typeof t.pickup_lat !== 'number' || typeof t.pickup_lng !== 'number') continue;
    const key = `${t.pickup_lat.toFixed(2)},${t.pickup_lng.toFixed(2)}`;
    const cell = byCell.get(key) ?? { trips: 0, unclaimed: 0 };
    cell.trips += 1;
    if (!['assigned', 'arrived', 'in_progress', 'completed'].includes(t.status)) cell.unclaimed += 1;
    byCell.set(key, cell);
  }
  res.json(
    [...byCell.entries()].map(([cell, v]) => ({ cell, ...v })).sort((a, b) => b.trips - a.trips),
  );
});
