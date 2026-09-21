import { supabaseAdmin } from '../supabase/client';

export type Role = 'rider' | 'driver';

export interface Session {
  phone: string;
  state: string;
  role: Role | null;
  current_trip_id: string | null;
  data: Record<string, unknown>;
  updated_at?: string;
}

export async function getSession(phone: string): Promise<Session | null> {
  const { data } = await supabaseAdmin
    .from('conversation_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  return (data as Session | null) ?? null;
}

/** Merge a patch into the existing session. Does NOT clear data. */
export async function upsertSession(
  phone: string,
  patch: Partial<Pick<Session, 'state' | 'role' | 'current_trip_id' | 'data'>>,
): Promise<void> {
  const existing = await getSession(phone);
  const next = {
    phone,
    state: patch.state ?? existing?.state ?? 'idle',
    role: patch.role ?? existing?.role ?? null,
    current_trip_id: patch.current_trip_id ?? existing?.current_trip_id ?? null,
    data: { ...(existing?.data ?? {}), ...(patch.data ?? {}) },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from('conversation_sessions').upsert(next);
  if (error) console.error('[SESSION UPSERT ERROR]', phone, error.message);
}

/**
 * Full reset. Use this whenever a trip closes - merging {} over existing keys
 * does nothing and leaves stale pending_trip_id behind.
 */
export async function resetSession(
  phone: string,
  patch: Partial<Pick<Session, 'state' | 'role' | 'current_trip_id' | 'data'>> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from('conversation_sessions').upsert({
    phone,
    state: patch.state ?? 'idle',
    role: patch.role ?? (await getSession(phone))?.role ?? null,
    current_trip_id: patch.current_trip_id ?? null,
    data: patch.data ?? {},
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('[SESSION RESET ERROR]', phone, error.message);
}

export async function deleteSession(phone: string): Promise<void> {
  await supabaseAdmin.from('conversation_sessions').delete().eq('phone', phone);
}

export async function setState(phone: string, state: string): Promise<void> {
  await upsertSession(phone, { state });
}
