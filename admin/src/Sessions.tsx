import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, resetSession } from './api';

interface Session {
  phone: string;
  state: string;
  role: string | null;
  current_trip_id: string | null;
  data: Record<string, unknown>;
  updated_at: string;
}

export function Sessions() {
  const [rows, setRows] = useState<Session[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  async function load() {
    void getSessions().then((r) => setRows(r as Session[]));
  }

  useEffect(() => {
    void load();
  }, []);

  /** Reset one person without leaving the page - this is the debugger. */
  async function reset(phone: string) {
    if (!confirm(`Reset ${phone} to idle? The conversation starts fresh; any live trip is left alone.`)) return;
    setBusy(phone);
    setNote(null);
    try {
      const r = (await resetSession(phone, 'idle')) as { note?: string };
      setNote(`${phone}: ${r.note ?? 'reset'}`);
      await load();
    } catch (e) {
      setNote(`${phone}: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  const shown = filter
    ? rows.filter(
        (s) =>
          s.phone.includes(filter) ||
          s.state.toLowerCase().includes(filter.toLowerCase()) ||
          (s.role ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  // States that usually mean the conversation is stuck rather than progressing.
  const STUCK = ['awaiting_pickup_location', 'awaiting_drop_location', 'awaiting_trip_confirm'];

  return (
    <>
      <h1>Sessions</h1>
      <p className="muted">
        The state-machine debugger. When someone says &ldquo;the bot stopped replying&rdquo;, look
        here first — a stuck state or a leftover pending_trip_id is visible immediately. Reset puts
        them back to a clean idle.
      </p>

      <div className="row">
        <input
          placeholder="filter by phone, state or role"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 260 }}
        />
        <button onClick={() => void load()}>Refresh</button>
        {note && <span className="muted">{note}</span>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Phone</th>
            <th>Role</th>
            <th>State</th>
            <th>Trip</th>
            <th>Data</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => {
            const stale = Date.now() - new Date(s.updated_at).getTime() > 60 * 60 * 1000;
            return (
              <tr key={s.phone}>
                <td>
                  <Link to={`/recover/${encodeURIComponent(s.phone)}`}>{s.phone}</Link>
                </td>
                <td>{s.role ?? '—'}</td>
                <td>
                  {s.state}
                  {STUCK.includes(s.state) && <span className="badge warn"> may be stuck</span>}
                  {stale && <span className="badge warn"> stale &gt;1h</span>}
                </td>
                <td>{s.current_trip_id ? s.current_trip_id.slice(0, 8) : '—'}</td>
                <td>
                  <pre>{JSON.stringify(s.data)}</pre>
                </td>
                <td>{new Date(s.updated_at).toLocaleTimeString()}</td>
                <td>
                  <button disabled={busy === s.phone} onClick={() => void reset(s.phone)}>
                    {busy === s.phone ? '…' : 'Reset'}
                  </button>
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                {rows.length === 0 ? 'No active sessions.' : 'Nothing matches that filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
