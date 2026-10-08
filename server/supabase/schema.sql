-- V3 - Auto Board schema.
-- DESTRUCTIVE: drops and recreates all application tables.
-- Run against the shared Supabase project. PostGIS and pg_cron stay enabled.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Types

DROP TYPE IF EXISTS trip_status CASCADE;
DROP TYPE IF EXISTS quote_status CASCADE;
DROP TYPE IF EXISTS approval_status CASCADE;
DROP TYPE IF EXISTS session_role CASCADE;
DROP TYPE IF EXISTS paid_via_type CASCADE;
DROP TYPE IF EXISTS cancelled_by_type CASCADE;

CREATE TYPE trip_status AS ENUM ('open', 'assigned', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired', 'disputed');
CREATE TYPE quote_status AS ENUM ('pending', 'accepted', 'withdrawn', 'lapsed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE session_role AS ENUM ('rider', 'driver');
CREATE TYPE paid_via_type AS ENUM ('cash', 'qr');
CREATE TYPE cancelled_by_type AS ENUM ('rider', 'driver', 'office', 'system');

-- Tables

-- Drop order is children first: FKs point at trips/drivers/riders, so those go
-- last. Every table created below MUST be listed here, or a re-run collides.
DROP TABLE IF EXISTS bot_messages CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS ratings CASCADE;
DROP TABLE IF EXISTS lead_dispatches CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS trip_otps CASCADE;
DROP TABLE IF EXISTS help_requests CASCADE;
DROP TABLE IF EXISTS role_overrides CASCADE;
DROP TABLE IF EXISTS driver_daily CASCADE;
DROP TABLE IF EXISTS route_daily CASCADE;
DROP TABLE IF EXISTS daily_summary CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS riders CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

CREATE TABLE riders (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255),
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'kannada',
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  home_text TEXT,
  rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE drivers (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255),
  vehicle_no VARCHAR(32),
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'kannada',
  base_lat DOUBLE PRECISION,
  base_lng DOUBLE PRECISION,
  base_text TEXT,
  radius_km INTEGER NOT NULL DEFAULT 3,
  approval_status approval_status NOT NULL DEFAULT 'pending',
  kyc_aadhaar_url TEXT,
  kyc_aadhaar_back_url TEXT,
  kyc_selfie_url TEXT,
  aadhaar_no VARCHAR(32),
  vehicle_verified BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_verified_at TIMESTAMPTZ,
  kyc_verified_by VARCHAR(20),
  kyc_verified_at TIMESTAMPTZ,
  subscription_until TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drivers_approval ON drivers(approval_status);
CREATE INDEX idx_drivers_subscription ON drivers(subscription_until);
CREATE INDEX idx_drivers_location ON drivers USING GIST (ST_SetSRID(ST_MakePoint(base_lng, base_lat), 4326));

CREATE TABLE trips (
  id UUID PRIMARY KEY,
  trip_number SERIAL,
  rider_id UUID NOT NULL REFERENCES riders(id),
  driver_id UUID REFERENCES drivers(id),
  status trip_status NOT NULL DEFAULT 'open',
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_text TEXT,
  drop_lat DOUBLE PRECISION,
  drop_lng DOUBLE PRECISION,
  drop_text TEXT,
  dispute_lat DOUBLE PRECISION,   -- where the rider was when they disputed
  dispute_lng DOUBLE PRECISION,
  dispute_text TEXT,
  distance_km DOUBLE PRECISION,
  pickup_at TIMESTAMPTZ,
  quote_window_closes_at TIMESTAMPTZ,
  leads_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  code_4digit VARCHAR(4),
  quoted_amount_paise INTEGER,
  reported_fare_paise INTEGER,
  fare_check_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_quote_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  pick_deadline_at TIMESTAMPTZ,   -- set when the rider is shown the quote list
  next_lead_batch_at TIMESTAMPTZ, -- staged dispatch: when the next batch is due
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  resolution_note TEXT,           -- office's ruling when closing a disputed trip
  cancelled_by cancelled_by_type
);

CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_rider ON trips(rider_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_window ON trips(quote_window_closes_at) WHERE status = 'open';
CREATE INDEX idx_trips_pickup ON trips USING GIST (ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326));

-- One active trip per rider, and one per driver, enforced by the database.
-- The driver index deliberately excludes 'open': a driver may hold quotes on
-- many open trips but may only ever have one that is assigned to them. It also
-- excludes trips the driver has already finished (`done_at` set) and disputes:
-- the ride is over for the driver, so he must be free for new leads even while
-- the rider is still confirming or the office is resolving a dispute. The rider
-- index keeps 'completed' out too; an unconfirmed trip is still 'in_progress'.
CREATE UNIQUE INDEX one_active_trip_per_rider ON trips (rider_id)
  WHERE status IN ('open', 'assigned', 'arrived', 'in_progress', 'disputed');
CREATE UNIQUE INDEX one_active_trip_per_driver ON trips (driver_id)
  WHERE status IN ('assigned', 'arrived', 'in_progress') AND done_at IS NULL;

CREATE TABLE ratings (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  by_role VARCHAR(10) NOT NULL CHECK (by_role IN ('rider', 'driver')),
  target_id UUID NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, by_role)
);

CREATE INDEX idx_ratings_trip ON ratings(trip_id);
CREATE INDEX idx_ratings_target ON ratings(target_id);

CREATE TABLE quotes (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  amount_paise INTEGER NOT NULL,
  status quote_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, driver_id)
);

CREATE INDEX idx_quotes_trip ON quotes(trip_id);
CREATE INDEX idx_quotes_driver ON quotes(driver_id);

CREATE TABLE lead_dispatches (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  distance_km DOUBLE PRECISION,
  channel TEXT NOT NULL DEFAULT 'interactive',   -- interactive | template
  template_name TEXT,
  wamid TEXT,                                    -- join key for statuses receipts
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  UNIQUE (trip_id, driver_id)
);

CREATE INDEX idx_dispatches_trip ON lead_dispatches(trip_id);
CREATE INDEX idx_dispatches_wamid ON lead_dispatches(wamid);

CREATE TABLE trip_otps (
  trip_id UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  code VARCHAR(4) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_amount_paise INTEGER NOT NULL,
  paid_via paid_via_type NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  recorded_by VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_driver ON subscriptions(driver_id);

CREATE TABLE conversation_sessions (
  phone VARCHAR(20) PRIMARY KEY,
  state VARCHAR(50) NOT NULL DEFAULT 'idle',
  role session_role,
  current_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_state ON conversation_sessions(state);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_role VARCHAR(10) NOT NULL,
  actor_id UUID,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_events_trip ON events(trip_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_at ON events(at);

CREATE TABLE bot_messages (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  role VARCHAR(10) NOT NULL CHECK (role IN ('rider', 'driver')),
  message_type VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  session_state VARCHAR(50),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bot_messages_phone ON bot_messages(phone);
CREATE INDEX idx_bot_messages_trip ON bot_messages(trip_id);

-- A person who asked for a human. Kept separate from bot_messages because it
-- carries state the office acts on (open -> closed), not just a transcript.
CREATE TABLE help_requests (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  role VARCHAR(10) CHECK (role IN ('rider', 'driver')),
  source VARCHAR(20) NOT NULL,           -- help | dispute
  reason TEXT,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by VARCHAR(100)
);

CREATE INDEX idx_help_open ON help_requests(opened_at) WHERE closed_at IS NULL;
CREATE INDEX idx_help_phone ON help_requests(phone);

-- Office role override. A role is normally resolved from which table a phone is
-- in, but a wrong Rider/Driver choice must be correctable and must stick (the
-- session row is deleted by the 24h cleanup). Consulted before the tables.
CREATE TABLE role_overrides (
  phone VARCHAR(20) PRIMARY KEY,
  role VARCHAR(10) NOT NULL CHECK (role IN ('rider', 'driver')),
  previous_role VARCHAR(10),      -- natural role to restore when cleared
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  set_by VARCHAR(100)
);

CREATE TABLE settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  quote_window_minutes INTEGER NOT NULL DEFAULT 30,
  max_drivers_per_lead INTEGER NOT NULL DEFAULT 25,
  default_radius_km INTEGER NOT NULL DEFAULT 3,
  radius_options INTEGER[] NOT NULL DEFAULT '{2,3,5,8}',
  -- Off for launch: with few drivers a scheduled trip usually goes unfilled,
  -- which costs more trust than not offering it. Turn on when supply can serve it.
  scheduling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_pick_cheapest BOOLEAN NOT NULL DEFAULT FALSE,
  fare_check_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  trial_days INTEGER NOT NULL DEFAULT 30,
  trial_min_rides INTEGER NOT NULL DEFAULT 10,
  dispute_hours INTEGER NOT NULL DEFAULT 24,
  scheduled_lead_hours INTEGER NOT NULL DEFAULT 2,
  -- Scheduled leads are never sent during the quiet window (IST hours).
  -- A trip whose normal lead time falls inside it is offered the evening
  -- before instead, so early-morning pickups reach awake drivers.
  quiet_hours_start INTEGER NOT NULL DEFAULT 22,
  quiet_hours_end INTEGER NOT NULL DEFAULT 7,
  evening_dispatch_hour INTEGER NOT NULL DEFAULT 21,
  -- A scheduled trip with no quote this many minutes before pickup is expired
  -- and the rider warned, instead of failing at the pickup time.
  scheduled_confirm_minutes INTEGER NOT NULL DEFAULT 90,
  -- After a trip's quote window closes with quotes, the rider is shown the list.
  -- If they do not pick one within this many minutes, the trip expires so it
  -- stops blocking them from booking again.
  pick_deadline_minutes INTEGER NOT NULL DEFAULT 30,
  -- Staged dispatch: offer leads to a small nearest batch first, then widen only
  -- if the trip still has too few quotes. Bounds message cost and driver noise.
  lead_stage_size INTEGER NOT NULL DEFAULT 10,
  lead_stage_interval_minutes INTEGER NOT NULL DEFAULT 6,
  lead_stage_expand_below INTEGER NOT NULL DEFAULT 3,
  -- Platform-initiated template leads per driver per day (0 = unlimited). Caps
  -- the cost of a dormant driver and stops spamming someone who is not replying.
  template_leads_per_driver_per_day INTEGER NOT NULL DEFAULT 5,
  -- Within this many km of the pickup, warm drivers (free to reach, at their
  -- phone) are offered before cold ones. Beyond it, nearest-first wins, so a
  -- warm driver further away never jumps a cold one nearby. 0 disables it.
  lead_warm_band_km INTEGER NOT NULL DEFAULT 1,
  subscription_price_paise INTEGER NOT NULL DEFAULT 19900,
  renewal_contact VARCHAR(30),
  helpline VARCHAR(30),
  -- Phone the office reads and answers. Receives a WhatsApp alert for every
  -- new help request and dispute. Independent of helpline: that is what a user
  -- dials, this is who gets notified. They may be the same number.
  office_number VARCHAR(30),
  -- Meta often mangles proposed names during approval, so these are configured
  -- rather than hardcoded.
  lead_template TEXT NOT NULL DEFAULT 'new_lead',
  kyc_approved_template TEXT NOT NULL DEFAULT 'kyc_approved',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- Matching: approved, subscribed, not already on a trip, within their own radius.

CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_limit INTEGER
)
RETURNS TABLE (
  id UUID,
  phone VARCHAR,
  name VARCHAR,
  vehicle_no VARCHAR,
  rating_avg DOUBLE PRECISION,
  rating_count INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    d.id,
    d.phone,
    d.name,
    d.vehicle_no,
    d.rating_avg,
    d.rating_count,
    ST_DistanceSphere(
      ST_MakePoint(d.base_lng, d.base_lat),
      ST_MakePoint(p_lng, p_lat)
    ) / 1000 AS distance_km
  FROM drivers d
  WHERE d.approval_status = 'approved'
    AND d.base_lat IS NOT NULL
    AND d.base_lng IS NOT NULL
    AND (d.subscription_until IS NULL OR d.subscription_until > NOW())
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(d.base_lng, d.base_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      d.radius_km * 1000
    )
    AND NOT EXISTS (
      SELECT 1 FROM trips t
      WHERE t.driver_id = d.id
        AND t.status IN ('assigned', 'arrived', 'in_progress')
        AND t.done_at IS NULL
    )
  ORDER BY distance_km ASC
  LIMIT p_limit;
$$;

-- DB-side cleanup and dispute flagging. Anything that must send a WhatsApp
-- message is handled by the Node scheduler instead, since pg_cron cannot.

CREATE OR REPLACE FUNCTION v3_auto_dispute_stale() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE trips
     SET status = 'disputed'
   WHERE status = 'in_progress'
     AND done_at IS NOT NULL
     AND done_at < NOW() - (
       SELECT (dispute_hours || ' hours')::INTERVAL FROM settings WHERE id = TRUE
     );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('v3-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'v3-cleanup',
  '*/5 * * * *',
  $$
    DELETE FROM trip_otps WHERE expires_at < NOW();
    DELETE FROM conversation_sessions WHERE updated_at < NOW() - INTERVAL '24 hours';
    SELECT v3_auto_dispute_stale();
  $$
);

-- ── Analytics rollups (nightly) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_daily (
  driver_id UUID NOT NULL REFERENCES drivers(id),
  day DATE NOT NULL,
  leads_sent INTEGER NOT NULL DEFAULT 0,
  leads_read INTEGER NOT NULL DEFAULT 0,
  quotes_sent INTEGER NOT NULL DEFAULT 0,
  quotes_won INTEGER NOT NULL DEFAULT 0,
  trips_completed INTEGER NOT NULL DEFAULT 0,
  cancels INTEGER NOT NULL DEFAULT 0,
  median_response_seconds INTEGER,
  quoted_paise_avg INTEGER,
  PRIMARY KEY (driver_id, day)
);

CREATE TABLE IF NOT EXISTS route_daily (
  day DATE NOT NULL,
  cell VARCHAR(24) NOT NULL,
  trips INTEGER NOT NULL DEFAULT 0,
  assigned INTEGER NOT NULL DEFAULT 0,
  unclaimed INTEGER NOT NULL DEFAULT 0,
  quoted_p50_paise INTEGER,
  accepted_p50_paise INTEGER,
  PRIMARY KEY (day, cell)
);

CREATE TABLE IF NOT EXISTS daily_summary (
  day DATE PRIMARY KEY,
  trips INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  unclaimed INTEGER NOT NULL DEFAULT 0,
  median_seconds_to_first_quote INTEGER,
  active_drivers INTEGER NOT NULL DEFAULT 0,
  new_riders INTEGER NOT NULL DEFAULT 0,
  repeat_riders INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION v3_rollup_day(p_day DATE) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN SELECT id FROM drivers LOOP
    INSERT INTO driver_daily AS dd (
      driver_id, day, leads_sent, leads_read, quotes_sent, quotes_won,
      trips_completed, cancels, median_response_seconds, quoted_paise_avg
    )
    SELECT
      d.id,
      p_day,
      (SELECT COUNT(*) FROM lead_dispatches ld WHERE ld.driver_id = d.id AND ld.sent_at::date = p_day),
      (SELECT COUNT(*) FROM lead_dispatches ld WHERE ld.driver_id = d.id AND ld.sent_at::date = p_day AND ld.read_at IS NOT NULL),
      (SELECT COUNT(*) FROM quotes q WHERE q.driver_id = d.id AND q.created_at::date = p_day),
      (SELECT COUNT(*) FROM quotes q WHERE q.driver_id = d.id AND q.created_at::date = p_day AND q.status = 'accepted'),
      (SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.id AND t.completed_at::date = p_day),
      (SELECT COUNT(*) FROM events e WHERE e.type = 'cancelled' AND e.actor_role = 'driver' AND e.actor_id = d.id AND e.at::date = p_day),
      (
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (q.created_at - ld.sent_at))
        )
        FROM quotes q
        JOIN lead_dispatches ld ON ld.trip_id = q.trip_id AND ld.driver_id = q.driver_id
        WHERE q.driver_id = d.id AND q.created_at::date = p_day
      ),
      (SELECT AVG(q.amount_paise) FROM quotes q WHERE q.driver_id = d.id AND q.created_at::date = p_day)
    ON CONFLICT (driver_id, day) DO UPDATE SET
      leads_sent = EXCLUDED.leads_sent,
      leads_read = EXCLUDED.leads_read,
      quotes_sent = EXCLUDED.quotes_sent,
      quotes_won = EXCLUDED.quotes_won,
      trips_completed = EXCLUDED.trips_completed,
      cancels = EXCLUDED.cancels,
      median_response_seconds = EXCLUDED.median_response_seconds,
      quoted_paise_avg = EXCLUDED.quoted_paise_avg;
  END LOOP;

  INSERT INTO route_daily AS rd (day, cell, trips, assigned, unclaimed, quoted_p50_paise, accepted_p50_paise)
  SELECT
    p_day,
    cell,
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('assigned','arrived','in_progress','completed')),
    COUNT(*) FILTER (WHERE status NOT IN ('assigned','arrived','in_progress','completed')),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY q.amount_paise)
       FROM quotes q WHERE q.trip_id = ANY (ARRAY_AGG(t.id))),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY t2.quoted_amount_paise)
       FROM trips t2 WHERE t2.id = ANY (ARRAY_AGG(t.id)) AND t2.quoted_amount_paise IS NOT NULL)
  FROM (
    SELECT id, status,
           CONCAT(ROUND(pickup_lat::numeric, 2), ',', ROUND(pickup_lng::numeric, 2)) AS cell
    FROM trips
    WHERE created_at::date = p_day
      AND pickup_lat IS NOT NULL
      AND pickup_lng IS NOT NULL
  ) t
  GROUP BY cell
  ON CONFLICT (day, cell) DO UPDATE SET
    trips = EXCLUDED.trips,
    assigned = EXCLUDED.assigned,
    unclaimed = EXCLUDED.unclaimed,
    quoted_p50_paise = EXCLUDED.quoted_p50_paise,
    accepted_p50_paise = EXCLUDED.accepted_p50_paise;

  INSERT INTO daily_summary AS ds (
    day, trips, completed, unclaimed, median_seconds_to_first_quote,
    active_drivers, new_riders, repeat_riders, messages_sent
  )
  SELECT
    p_day,
    (SELECT COUNT(*) FROM trips WHERE created_at::date = p_day),
    (SELECT COUNT(*) FROM trips WHERE completed_at::date = p_day),
    (SELECT COUNT(*) FROM trips WHERE created_at::date = p_day AND first_quote_at IS NULL),
    (
      SELECT percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (first_quote_at - created_at))
      )
      FROM trips WHERE created_at::date = p_day AND first_quote_at IS NOT NULL
    ),
    (SELECT COUNT(*) FROM drivers WHERE approval_status = 'approved'),
    (SELECT COUNT(*) FROM riders WHERE created_at::date = p_day),
    (SELECT COUNT(DISTINCT rider_id) FROM trips WHERE created_at::date = p_day
       AND rider_id IN (SELECT rider_id FROM trips WHERE created_at::date < p_day)),
    (SELECT COUNT(*) FROM bot_messages WHERE direction = 'outbound' AND created_at::date = p_day)
  ON CONFLICT (day) DO UPDATE SET
    trips = EXCLUDED.trips,
    completed = EXCLUDED.completed,
    unclaimed = EXCLUDED.unclaimed,
    median_seconds_to_first_quote = EXCLUDED.median_seconds_to_first_quote,
    active_drivers = EXCLUDED.active_drivers,
    new_riders = EXCLUDED.new_riders,
    repeat_riders = EXCLUDED.repeat_riders,
    messages_sent = EXCLUDED.messages_sent;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('v3-rollup');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'v3-rollup',
  '30 18 * * *',
  $$ SELECT v3_rollup_day((NOW() - INTERVAL '1 day')::date); $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
--
-- Every application table is locked down with RLS and NO policies. The backend
-- connects with the service role key (BYPASSRLS) so it is unaffected; the anon
-- and authenticated keys get zero rows. Without this, anyone holding the
-- publishable key can read driver KYC URLs, Aadhaar numbers, rider phone
-- numbers and every message transcript.
--
-- A NEW TABLE MUST BE ADDED HERE. A table created without RLS is world-readable.
--
-- spatial_ref_sys is excluded on purpose - PostGIS functions read it directly.
-- storage.objects is excluded too; Supabase manages Storage separately.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;

-- Sanity check: every row must read true except spatial_ref_sys.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;
