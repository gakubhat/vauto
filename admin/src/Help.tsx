import { useState } from 'react';
import { closeHelpRequest, getHelpRequests, getSettings, reopenHelpRequest } from './api';
import { Notice, useApi } from './ui';

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

interface HelpData {
  rows: HelpRequest[];
  helpline: string | null;
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
  const [busy, setBusy] = useState<string | null>(null);

  const { data, error, loading, reload } = useApi<HelpData>(
    async () => ({
      rows: (await getHelpRequests(openOnly)) as HelpRequest[],
      helpline: ((await getSettings()) as { helpline: string | null }).helpline,
    }),
    [openOnly],
  );

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy(null);
  }

  const rows = data?.rows ?? [];
  const openCount = rows.filter((r) => !r.closed_at).length;

  return (
    <>
      <h1>
        Help requests{' '}
        <span className={`badge ${openCount > 0 ? 'warn' : 'ok'}`}>{openCount} waiting</span>
      </h1>
      <p className="muted">
        People who asked for a human — by sending "help" or disputing a trip. Call them back, then
        mark it handled.
      </p>
      {data?.helpline && (
        <p className="notice-ok">
          Call from <strong>{data.helpline}</strong>
        </p>
      )}
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />{' '}
          Open only
        </label>
        <button onClick={() => void reload()}>Refresh</button>
      </div>

      <Notice error={error} loading={loading} onRetry={reload} />

      {data && rows.length === 0 && <p className="muted">Nothing waiting. Good.</p>}

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
              <>
                <span className="muted">
                  handled {new Date(r.closed_at).toLocaleString()} by {r.closed_by ?? '—'}
                </span>
                <button disabled={busy === r.id} onClick={() => void act(r.id, () => reopenHelpRequest(r.id))}>
                  Reopen
                </button>
              </>
            ) : (
              <button
                className="primary"
                disabled={busy === r.id}
                onClick={() => {
                  if (confirm(`Mark ${r.phone}'s request handled?`)) {
                    void act(r.id, () => closeHelpRequest(r.id));
                  }
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
