import { config } from '../config';

/**
 * Turning coordinates into something a human recognises.
 *
 * WhatsApp sometimes includes a place name or address on an inbound location
 * message, but a plain "current location" share usually carries only lat/lng.
 * So we reverse geocode as a fallback.
 *
 * The geocoder is swappable so the test suite never touches the network.
 */

export type Geocoder = (lat: number, lng: number) => Promise<string | null>;

const cache = new Map<string, string | null>();

function cacheKey(lat: number, lng: number): string {
  // ~11 m precision: close enough that neighbouring taps share a lookup.
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Bits of an address nobody needs on a phone screen, and which make the line
 * wrap badly: country, state, PIN code, and Plus Codes ("XF7H+8R3").
 */
const NOISE = [
  /^india$/i,
  /\b\d{6}\b/, // PIN code, alone or attached to a state name
  /^[A-Z0-9]{4}\+[A-Z0-9]{2,3}$/i, // Plus Code
];

/**
 * Cut a one-line address down to the first few meaningful parts.
 * Used for blobs (WhatsApp's own address) where we have no structure.
 */
export function shortenAddress(raw: string, maxParts = 3): string {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !NOISE.some((re) => re.test(p)));
  if (parts.length === 0) return raw.trim();
  return parts.slice(0, maxParts).join(', ');
}

/** Nominatim gives structured parts - pick the two a local would say. */
function fromNominatimAddress(a: Record<string, string> | undefined, fallback: string): string {
  if (!a) return shortenAddress(fallback);
  const locality =
    a.neighbourhood ?? a.suburb ?? a.village ?? a.hamlet ?? a.town ?? a.city_district ?? a.city;
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.residential;
  const label = [road, locality].filter(Boolean).join(', ');
  if (label) return label;
  const city = a.city_district ?? a.city ?? a.town ?? a.county;
  return city ? String(city) : shortenAddress(fallback);
}

async function nominatim(lat: number, lng: number): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18` +
    `&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: {
      // Nominatim requires a identifying User-Agent and asks for low volume.
      'User-Agent': 'VJobsAutoBoard/0.1 (contact: office)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    name?: string;
    display_name?: string;
    address?: Record<string, string>;
  };
  // A named place ("Bus Stand") beats any constructed address.
  if (body.name) return body.name;
  if (body.display_name || body.address) {
    return fromNominatimAddress(body.address, body.display_name ?? '');
  }
  return null;
}

async function google(lat: number, lng: number): Promise<string | null> {
  if (!config.googleMapsApiKey) return null;
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
    `&key=${config.googleMapsApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    results?: Array<{ formatted_address?: string }>;
  };
  return body.results?.[0]?.formatted_address ?? null;
}

function providerFor(name: string): Geocoder | null {
  if (name === 'nominatim') return nominatim;
  if (name === 'google') return google;
  return null; // 'off' or unknown
}

let override: Geocoder | null = null;

/** Test seam - keeps the suite off the network and deterministic. */
export function setGeocoder(fn: Geocoder | null): void {
  override = fn;
  cache.clear();
}

/**
 * Best-effort readable address. Never throws and never blocks a flow for long:
 * a failure just means we show coordinates, as before.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key) ?? null;

  const impl = override ?? providerFor(config.geocoder);
  if (!impl) {
    cache.set(key, null);
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.geocodeTimeoutMs);
    const result = await Promise.race([
      impl(lat, lng),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), config.geocodeTimeoutMs)),
    ]);
    clearTimeout(timer);
    cache.set(key, result);
    return result;
  } catch (e) {
    console.error('[GEOCODE ERROR]', lat, lng, (e as Error).message);
    cache.set(key, null);
    return null;
  }
}

/** Prefer what WhatsApp gave us; fall back to geocoding. */
export async function resolveAddress(
  lat: number,
  lng: number,
  fromWhatsApp?: { name?: string; address?: string },
): Promise<string | null> {
  // A name the rider/driver chose beats anything we can derive.
  const named = fromWhatsApp?.name?.trim();
  if (named) return named;

  const geocoded = await reverseGeocode(lat, lng);
  if (geocoded) return geocoded;

  // WhatsApp's own address is a long single line - only worth it as a
  // last resort, and only after trimming country/state/PIN.
  const blob = fromWhatsApp?.address?.trim();
  return blob ? shortenAddress(blob) : null;
}
