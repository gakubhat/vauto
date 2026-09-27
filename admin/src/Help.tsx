import { useEffect, useState } from 'react';
import { closeHelpRequest, getHelpRequests } from './api';

interface HelpRequest {
  id: string;
  phone: string;
  role: string | null;
  source: string;
  reason: string | null;
  trip_id: string | null;
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  recent: Array<{ direction: string; body: string; created_at: string }>;
}

function waited(from: string): string {
  const mins = Math.round((Date.now() - new Date(from).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function Help() {
  const [openOnly, setOpenOnly] = useState(true);
  const [rows, setRows] = useState<HelpRequest[] | null>(null);

  async function load() {
    setRows((await getHelpRequests(openOnly)) as HelpRequest[]);
  }

  useEffect(() => {
    void load();
  }, [openOnly]);

  if (!rows) return <p>Loading…</p>;

  const openCount = rows.filter((r) => !r.closed_at).length;

  return (
    <>
      <h1>
        Help requests{' '}
        <span className={`badge ${openCount > 0 ? 'warn' : 'ok'}`}>{openCount} waiting</span>
      </h1>
      <p className="muted">
        People who asked for a human — by sending "help" or disputing a trip. Call them back, then
        mark it handled. The number to call is in Settings.
      </p>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />{' '}
          Open only
        </label>
        <button onClick={() => void load()}>Refresh</button>
      </div>

      {rows.length === 0 && <p className="muted">Nothing waiting. Good.</p>}

      {rows.map((r) => (
        <div className="panel" key={r.id}>
          <div className="row">
            <strong>{r.phone}</strong>
            <span className={`badge ${r.source === 'dispute' ? 'bad' : 'warn'}`}>{r.source}</span>
            {r.role && <span className="muted">{r.role}</span>}
            <a href={`https://wa.me/${r.phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">
              whatsapp
            </a>
            {!r.closed_at && <span className="muted">waiting {waited(r.opened_at)}</span>}
            {r.closed_at ? (
              <span className="muted">
                handled {new Date(r.closed_at).toLocaleString()} by {r.closed_by ?? '—'}
              </span>
            ) : (
              <button
                className="primary"
                onClick={async () => {
                  await closeHelpRequest(r.id);
                  void load();
                }}
              >
                Mark handled
              </button>
            )}
          </div>
          {r.reason && <p className="muted">Reason: {r.reason}</p>}
          {r.trip_id && <p className="muted">Trip {r.trip_id.slice(0, 8)}</p>}
          <div className="muted">
            {r.recent.map((m, i) => (
              <div key={i}>
                {m.direction === 'inbound' ? '→ ' : '← '}
                {m.body}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
