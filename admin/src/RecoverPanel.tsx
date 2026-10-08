import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRecover, resetSession } from './api';

interface RecoverData {
  phone: string;
  session: {
    state: string;
    role: string | null;
    current_trip_id: string | null;
    data: Record<string, unknown>;
    updated_at: string;
  } | null;
  rider: { id: string; name: string | null } | null;
  driver: { id: string; name: string | null; approval_status: string } | null;
  help_open: Array<{ id: string; source: string; opened_at: string }>;
  blocking_trip: { id: string; trip_number: number; status: string; created_at: string } | null;
  role_override: 'rider' | 'driver' | null;
  problems: string[];
  session_age_seconds: number | null;
}

function age(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/**
 * The office's "something is wrong with this person" view.
 *
 * Built for staff who are not technical and should not have to read JSON: it
 * states what is wrong in words and offers one action that fixes it.
 */
export function RecoverPanel({ phone }: { phone: string }) {
  const [d, setD] = useState<RecoverData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      setD((await getRecover(phone)) as RecoverData);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [phone]);

  if (!d) return <p className="muted">Loading…</p>;

  async function doReset(to: 'idle' | 'clear') {
    setBusy(true);
    setMessage(null);
    try {
      const r = (await resetSession(phone, to)) as { note?: string };
      setMessage(r.note ?? 'Done.');
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy(false);
  }

  const st = d.session?.state;

  return (
    <div className="panel">
      <h2>
        Recover this person{' '}
        <span className={`badge ${d.problems.length ? 'bad' : 'ok'}`}>
          {d.problems.length ? `${d.problems.length} issue(s)` : 'looks healthy'}
        </span>
      </h2>

      <p className="muted">
        {d.rider && <>Rider: {d.rider.name ?? 'unnamed'} </>}
        {d.driver && <>Driver: {d.driver.name ?? 'unnamed'} ({d.driver.approval_status}) </>}
        {!d.rider && !d.driver && <>Not in riders or drivers — will be asked Rider/Driver again.</>}
      </p>

      <table>
        <tbody>
          <tr>
            <td>State</td>
            <td>
              {st ?? 'no session'} {d.session && <span className="muted">· {age(d.session_age_seconds)}</span>}
            </td>
          </tr>
          <tr>
            <td>Role</td>
            <td>
              {d.session?.role ?? '—'}
              {d.role_override && (
                <>
                  {' '}
                  <span className="badge warn">pinned to {d.role_override}</span>
                </>
              )}
            </td>
          </tr>
          {d.role_override && (
            <tr>
              <td>Override</td>
              <td className="muted">
                This phone is forced onto the {d.role_override} flow. Clear it from the{' '}
                {d.role_override === 'driver' ? 'driver' : 'rider'} detail page if that was a
                mistake.
              </td>
            </tr>
          )}
          {d.blocking_trip && (
            <tr>
              <td>Live trip</td>
              <td>
                <Link to={`/trips/${d.blocking_trip.id}`}>
                  #{d.blocking_trip.trip_number} ({d.blocking_trip.status})
                </Link>
              </td>
            </tr>
          )}
          {d.help_open.length > 0 && (
            <tr>
              <td>Waiting for help</td>
              <td className="bad">
                {d.help_open.map((h) => `${h.source} (${age(Math.round((Date.now() - new Date(h.opened_at).getTime()) / 1000))})`).join(', ')}
              </td>
            </tr>
          )}
          {d.session?.data && Object.keys(d.session.data).length > 0 && (
            <tr>
              <td>Session data</td>
              <td>
                <pre>{JSON.stringify(d.session.data)}</pre>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {d.problems.length > 0 && (
        <>
          <h3>What is wrong</h3>
          <ul>
            {d.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}

      <div className="row">
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            if (confirm(`Reset ${phone} to idle? The conversation starts fresh. Any live trip is left alone.`))
              void doReset('idle');
          }}
        >
          Reset to idle
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete ${phone}'s session entirely? They will re-resolve their role on the next message. A live trip is not affected.`))
              void doReset('clear');
          }}
        >
          Delete session
        </button>
        <span className="muted">
          Reset fixes a stuck state. Delete also clears the role, so a wrong Rider/Driver choice is
          forgotten. Neither touches a live trip — close that in Trip Detail.
        </span>
      </div>

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
