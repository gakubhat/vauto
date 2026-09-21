export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Road distance is longer than straight-line. Used only for display and for
 * the distance shown on a lead - never for pricing.
 */
export function estimateRoadKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * 1.25 * 10) / 10;
}

export function hasCoords(p?: { lat?: number | null; lng?: number | null }): boolean {
  return typeof p?.lat === 'number' && typeof p?.lng === 'number';
}

/** "400 m" reads better than "0.4 km", and "0 km" is meaningless. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '?';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toFixed(1)} km`;
}
