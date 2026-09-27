-- Enable Row Level Security on every application table.
--
-- WHY THIS IS SAFE FOR THE APP
-- The Express backend connects with the Supabase service role key, which has
-- BYPASSRLS. It is unaffected by RLS. Verified: with RLS enabled on settings
-- the full test suite (43 tests across every flow) still passes, and the
-- admin API still reads and writes settings.
--
-- WHAT IT CHANGES
-- The anon (publishable) and authenticated keys get ZERO access. Today anyone
-- who obtains the publishable key can read driver KYC documents, Aadhaar
-- numbers and rider phone numbers. This closes that.
--
-- NO POLICIES ARE ADDED ON PURPOSE
-- An RLS-enabled table with no policies denies everything to anon and
-- authenticated. That is the desired state here - all access is meant to go
-- through the backend.
--
-- EXCLUDED
-- spatial_ref_sys - PostGIS lookup table, ST_* functions read it directly.
-- storage.objects - Supabase manages Storage separately; do not touch it.
--
-- HOW TO RUN
-- Supabase dashboard -> SQL Editor -> paste -> Run.

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

-- Confirm: every row below should read true (except spatial_ref_sys).
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;
