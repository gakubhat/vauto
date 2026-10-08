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
    throw new Error('Session expired');
  }
  if (!res.ok) {
    // The server always answers /api/* with JSON, but never assume it.
    let message = res.statusText;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* keep statusText */
    }
    throw new Error(message);
  }
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

/** Force a phone onto one flow, or 'auto' to clear the override. */
export const setDriverRole = (id: string, role: string) =>
  request(admin(`/drivers/${id}/role`), { method: 'POST', body: JSON.stringify({ role }) });
export const setRiderRole = (id: string, role: string) =>
  request(admin(`/riders/${id}/role`), { method: 'POST', body: JSON.stringify({ role }) });

export const getRiders = (params = '') => request(admin(`/riders${params}`));
export const getRider = (id: string) => request(admin(`/riders/${id}`));
export const patchRider = (id: string, body: unknown) =>
  request(admin(`/riders/${id}`), { method: 'PATCH', body: JSON.stringify(body) });

export const getTrips = (params = '') => request(admin(`/trips${params}`));
export const getTrip = (id: string) => request(admin(`/trips/${id}`));
export const setTripStatus = (
  id: string,
  body: { status: string; reason?: string; resolution_note?: string },
) => request(admin(`/trips/${id}/status`), { method: 'POST', body: JSON.stringify(body) });

export const getSessions = () => request(admin('/sessions'));
export const resetSession = (phone: string, to: 'idle' | 'clear' = 'idle') =>
  request(admin(`/sessions/${encodeURIComponent(phone)}/reset`), {
    method: 'POST',
    body: JSON.stringify({ to }),
  });
export const getRecover = (phone: string) => request(admin(`/recover/${encodeURIComponent(phone)}`));
export const getHelpRequests = (openOnly = true) => request(admin(`/help${openOnly ? '?open=1' : ''}`));
export const closeHelpRequest = (id: string) =>
  request(admin(`/help/${id}/close`), { method: 'POST' });
export const reopenHelpRequest = (id: string) =>
  request(admin(`/help/${id}/reopen`), { method: 'POST' });
export const getSettings = () => request(admin('/settings'));
export const putSettings = (body: unknown) =>
  request(admin('/settings'), { method: 'PUT', body: JSON.stringify(body) });
export const getFunnel = () => request(admin('/analytics/funnel'));
export const getDriverStats = (days = 30) => request(admin(`/analytics/drivers?days=${days}`));
export const getAreas = (days = 30) => request(admin(`/analytics/areas?days=${days}`));
