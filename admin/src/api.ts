const BASE = '/api';

async function request(path: string, opts?: RequestInit) {
  const token = sessionStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...opts?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('token');
    window.location.reload();
  }
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? res.statusText);
  return res.json();
}

export async function login(phone: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const data = (await res.json()) as { token: string };
  sessionStorage.setItem('token', data.token);
}

const admin = (p: string) => `/admin${p}`;

export const getMe = () => request(admin('/me'));
export const deleteDriver = (id: string) =>
  request(admin(`/drivers/${id}`), { method: 'DELETE' });
export const deleteRider = (id: string) =>
  request(admin(`/riders/${id}`), { method: 'DELETE' });

export const getStats = () => request(admin('/stats'));
export const getDrivers = (params = '') => request(admin(`/drivers${params}`));
export const getDriver = (id: string) => request(admin(`/drivers/${id}`));
export const createDriver = (body: unknown) =>
  request(admin('/drivers'), { method: 'POST', body: JSON.stringify(body) });
export const patchDriver = (id: string, body: unknown) =>
  request(admin(`/drivers/${id}`), { method: 'PATCH', body: JSON.stringify(body) });
export const setApproval = (id: string, action: string) =>
  request(admin(`/drivers/${id}/approval`), { method: 'POST', body: JSON.stringify({ action }) });
export const recordSubscription = (id: string, body: unknown) =>
  request(admin(`/drivers/${id}/subscription`), { method: 'POST', body: JSON.stringify(body) });
export const overrideRole = (id: string, role: string) =>
  request(admin(`/drivers/${id}/role`), { method: 'POST', body: JSON.stringify({ role }) });

export const getRiders = (params = '') => request(admin(`/riders${params}`));
export const getRider = (id: string) => request(admin(`/riders/${id}`));

export const getTrips = (params = '') => request(admin(`/trips${params}`));
export const getTrip = (id: string) => request(admin(`/trips/${id}`));
export const setTripStatus = (id: string, status: string, reason?: string) =>
  request(admin(`/trips/${id}/status`), {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });

export const getSessions = () => request(admin('/sessions'));
export const getSettings = () => request(admin('/settings'));
export const putSettings = (body: unknown) =>
  request(admin('/settings'), { method: 'PUT', body: JSON.stringify(body) });
export const getFunnel = () => request(admin('/analytics/funnel'));
export const getDriverStats = () => request(admin('/analytics/drivers'));
export const getAreas = () => request(admin('/analytics/areas'));
