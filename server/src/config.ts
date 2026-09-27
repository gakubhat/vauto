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

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: optionalInt('PORT', 3000),
  logLevel: optional('LOG_LEVEL', 'debug'),

  jwtSecret: required('JWT_SECRET'),
  adminPhone: required('ADMIN_PHONE'),
  adminPassword: required('ADMIN_PASSWORD'),

  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SERVICE_ROLE_KEY'),
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

  // 'nominatim' (free, no key), 'google' (needs GOOGLE_MAPS_API_KEY) or 'off'.
  geocoder: optional('GEOCODER', 'nominatim'),
  googleMapsApiKey: optional('GOOGLE_MAPS_API_KEY', ''),
  geocodeTimeoutMs: optionalInt('GEOCODE_TIMEOUT_MS', 3000),

  defaultRadiusKm: optionalInt('DEFAULT_RADIUS_KM', 3),
  otpTtlSeconds: optionalInt('TRIP_OTP_TTL_SECONDS', 3600),
};
