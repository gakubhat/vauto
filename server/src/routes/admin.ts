import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { supabaseAdmin } from '../supabase/client';
import { clearSettingsCache } from '../state/queries';
import { deleteDriverCompletely, deleteRiderCompletely } from '../lib/delete-user';
import { notifyDriverOfApproval } from '../lib/notify-driver';
import { signedUrl } from '../lib/storage';
import { deleteSession } from '../state/store';
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
    riders_total: await count('riders'),
  });
});

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
  ];
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

adminRouter.post('/drivers/:id/role', authenticate, async (req: Request, res: Response) => {
  const { role } = req.body as { role?: string };
  if (role !== 'rider' && role !== 'driver') {
    return res.status(400).json({ error: 'role must be rider or driver' });
  }
  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('phone, name')
    .eq('id', req.params.id)
    .single();
  if (!driver) return res.status(404).json({ error: 'Not found' });
  const phone = (driver as { phone: string }).phone;
  await deleteSession(phone);
  res.json({ ok: true, note: `session cleared for ${phone}; role now resolves from the tables` });
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
  res.json({ ...rider, trips: trips ?? [] });
});

adminRouter.patch('/riders/:id', authenticate, async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const allowed = ['name', 'home_lat', 'home_lng', 'home_text'];
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

adminRouter.get('/trips', authenticate, async (req: Request, res: Response) => {
  const { status, q } = req.query as Record<string, string | undefined>;
  let query = supabaseAdmin
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status);
  const { data } = await query;
  let rows = data ?? [];
  if (q) {
    const { data: riders } = await supabaseAdmin
      .from('riders')
      .select('id, phone, name')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const ids = new Set(((riders ?? []) as Array<{ id: string }>).map((r) => r.id));
    rows = (rows as Array<Record<string, unknown>>).filter(
      (r) => ids.has(r.rider_id as string) || String(r.trip_number) === q,
    );
  }
  res.json(rows);
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
  const { status, reason } = req.body as { status?: string; reason?: string };
  const allowed = ['cancelled', 'completed', 'disputed', 'expired', 'open'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  }
  const patch: Record<string, unknown> = { status };
  if (status === 'cancelled') {
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_by = 'office';
    patch.cancel_reason = reason ?? null;
  }
  if (status === 'completed') patch.completed_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('trips')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Debugging surfaces ─────────────────────────────────────────────────

adminRouter.get('/sessions', authenticate, async (_req: Request, res: Response) => {
  const { data } = await supabaseAdmin
    .from('conversation_sessions')
    .select('*')
    .order('updated_at', { ascending: false });
  res.json(data ?? []);
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
  const b = req.body as Record<string, unknown>;
  const allowed = [
    'quote_window_minutes',
    'max_drivers_per_lead',
    'default_radius_km',
    'radius_options',
    'auto_pick_cheapest',
    'fare_check_enabled',
    'trial_days',
    'trial_min_rides',
    'dispute_hours',
    'scheduled_lead_hours',
    'subscription_price_paise',
    'renewal_contact',
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in b) patch[k] = b[k];
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

adminRouter.get('/analytics/drivers', authenticate, async (_req: Request, res: Response) => {
  const { data: drivers } = await supabaseAdmin
    .from('drivers')
    .select('id, name, phone, vehicle_no, approval_status, subscription_until, rating_avg')
    .eq('approval_status', 'approved');
  const { data: dispatches } = await supabaseAdmin.from('lead_dispatches').select('driver_id');
  const { data: quotes } = await supabaseAdmin.from('quotes').select('driver_id, status');

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

adminRouter.get('/analytics/areas', authenticate, async (_req: Request, res: Response) => {
  const { data: trips } = await supabaseAdmin
    .from('trips')
    .select('id, status, pickup_lat, pickup_lng');
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
