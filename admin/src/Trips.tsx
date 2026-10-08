import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getTrips } from './api';
import { Notice, useApi } from './ui';

interface Trip {
  id: string;
  trip_number: number;
  status: string;
  rider_id: string;
  driver_id: string | null;
  distance_km: number | null;
  quoted_amount_paise: number | null;
  created_at: string;
}

const STATUSES = ['', 'open', 'assigned', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired', 'disputed'];
const PAGE_SIZE = 100;

export function Trips() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);

  const search = new URLSearchParams();
  if (status) search.set('status', status);
  if (q) search.set('q', q);
  if (page > 1) search.set('page', String(page));

  const { data: rows, error, loading, reload } = useApi<Trip[]>(
    () => getTrips(`?${search.toString()}`) as Promise<Trip[]>,
    [status, q, page],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page'); // any filter change resets to page 1
    setParams(next);
  }

  return (
    <>
      <h1>Trips</h1>
      <div className="row">
        <input
          placeholder="Trip number or rider name/phone"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', qInput.trim());
          }}
          style={{ width: 280 }}
        />
        <button onClick={() => setParam('q', qInput.trim())}>Search</button>
        <select value={status} onChange={(e) => setParam('status', e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'all statuses'}
            </option>
          ))}
        </select>
      </div>

      <Notice error={error} loading={loading} onRetry={reload} />

      {rows && (
        <>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Distance</th>
                <th>Quoted</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/trips/${t.id}`}>{t.trip_number}</Link>
                  </td>
                  <td>{t.status}</td>
                  <td>{t.distance_km ?? '—'}</td>
                  <td>{t.quoted_amount_paise ? `₹${Math.round(t.quoted_amount_paise / 100)}` : '—'}</td>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No trips match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="row">
            <button disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
              ← Previous
            </button>
            <span className="muted">Page {page}</span>
            <button
              disabled={(rows.length ?? 0) < PAGE_SIZE}
              onClick={() => setParam('page', String(page + 1))}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </>
  );
}
