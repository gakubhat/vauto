import { useEffect, useState } from 'react';
import { getSessions } from './api';

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

  useEffect(() => {
    void getSessions().then((r) => setRows(r as Session[]));
  }, []);

  return (
    <>
      <h1>Sessions</h1>
      <p className="muted">
        The state-machine debugger. When someone says &ldquo;the bot stopped replying&rdquo;, look
        here first — a stuck state or a leftover pending_trip_id is visible immediately.
      </p>
      <table>
        <thead>
          <tr>
            <th>Phone</th>
            <th>Role</th>
            <th>State</th>
            <th>Trip</th>
            <th>Data</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.phone}>
              <td>{s.phone}</td>
              <td>{s.role ?? '—'}</td>
              <td>{s.state}</td>
              <td>{s.current_trip_id ? s.current_trip_id.slice(0, 8) : '—'}</td>
              <td>
                <pre>{JSON.stringify(s.data)}</pre>
              </td>
              <td>{new Date(s.updated_at).toLocaleTimeString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No active sessions.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
