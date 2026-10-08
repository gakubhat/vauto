import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  return val.toLowerCase() === 'true' || val === '1';
}

// Tests call truncateAll(), which is destructive. They must NEVER point at the
// live project. Under NODE_ENV=test (vitest sets it) we switch to a dedicated
// throwaway project when one is configured, and tests refuse to wipe otherwise
// (see tests/harness.ts). A Supabase dev branch works as the test project.
const isTest = process.env.NODE_ENV === 'test';
const testSupabaseUrl = process.env.TEST_SUPABASE_URL ?? '';
const testSupabaseSecretKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? '';
const useTestDb = isTest && testSupabaseUrl !== '' && testSupabaseSecretKey !== '';

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: optionalInt('PORT', 3000),
  logLevel: optional('LOG_LEVEL', 'debug'),

  jwtSecret: required('JWT_SECRET'),
  adminPhone: required('ADMIN_PHONE'),
  adminPassword: required('ADMIN_PASSWORD'),

  supabaseUrl: useTestDb ? testSupabaseUrl : required('SUPABASE_URL'),
  supabaseSecretKey: useTestDb ? testSupabaseSecretKey : required('SUPABASE_SERVICE_ROLE_KEY'),
  // Non-empty only when a dedicated test project is configured. The destructive
  // guard compares the live client's URL against this.
  testSupabaseUrl,
  storageBucketKyc: optional('STORAGE_BUCKET_KYC', 'kyc'),

  // Single WhatsApp number for everyone — riders and drivers alike.
  whatsappWebhookVerifyToken: required('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
  whatsappAccessToken: required('WHATSAPP_ACCESS_TOKEN'),
  // Meta app secret, used to verify X-Hub-Signature-256 on every webhook POST.
  // Without it anyone who learns the URL can inject fake messages and trips.
  whatsappAppSecret: required('WHATSAPP_APP_SECRET'),
  whatsappPhoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappBusinessPhone: required('WHATSAPP_BUSINESS_PHONE'),
  // Pinned so an upgrade is an env change, not a code change. Check the
  // expiry at developers.facebook.com/docs/graph-api/changelog/versions
  whatsappApiVersion: optional('WHATSAPP_API_VERSION', 'v25.0'),

  // Tests truncate real tables. Refuse to run unless explicitly allowed.
  allowDestructiveTests: optionalBool('ALLOW_DESTRUCTIVE_TESTS', false),

  // Exposes "delete user" in the admin UI and enables the DELETE endpoints.
  // Off by default - deletion is irreversible and removes KYC documents.
  allowAdminDelete: optionalBool('ALLOW_ADMIN_DELETE', false),

  // Normally the office number is dropped at the webhook, because a reply from
  // it is a response to an alert and would otherwise start a signup with our
  // own staff. Turning this on lets the office number use the bot as a rider,
  // which is how screenshots and demos are captured. Leave it off in production
  // or the office stops being able to answer its own alerts without the bot
  // replying at them.
  allowOfficeAsUser: optionalBool('ALLOW_OFFICE_AS_USER', false),

  // 'nominatim' (free, no key), 'google' (needs GOOGLE_MAPS_API_KEY) or 'off'.
  geocoder: optional('GEOCODER', 'nominatim'),
  googleMapsApiKey: optional('GOOGLE_MAPS_API_KEY', ''),
  geocodeTimeoutMs: optionalInt('GEOCODE_TIMEOUT_MS', 3000),

  defaultRadiusKm: optionalInt('DEFAULT_RADIUS_KM', 3),
  otpTtlSeconds: optionalInt('TRIP_OTP_TTL_SECONDS', 3600),
};
