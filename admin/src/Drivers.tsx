import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createDriver, getDrivers } from './api';
import { Notice, useApi } from './ui';

interface Driver {
  id: string;
  phone: string;
  name: string | null;
  vehicle_no: string | null;
  radius_km: number;
  approval_status: string;
  subscription_until: string | null;
  rating_avg: number;
}

export function Drivers() {
  const [params, setParams] = useSearchParams();
  const approval = params.get('approval') ?? '';
  const subscription = params.get('subscription') ?? '';
  const q = params.get('q') ?? '';
  const [qInput, setQInput] = useState(q);
  const [showSeed, setShowSeed] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', vehicle_no: '', radius_km: 3 });

  useEffect(() => setQInput(q), [q]);

  const search = new URLSearchParams();
  if (approval) search.set('approval', approval);
  if (subscription) search.set('subscription', subscription);
  if (q) search.set('q', q);

  const { data: rows, error, loading, reload } = useApi<Driver[]>(
    () => getDrivers(`?${search.toString()}`) as Promise<Driver[]>,
    [approval, subscription, q],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  async function seed(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createDriver({ ...form, approval_status: 'approved' });
    } catch (err) {
      alert((err as Error).message);
      return;
    }
    setForm({ phone: '', name: '', vehicle_no: '', radius_km: 3 });
    setShowSeed(false);
    void reload();
  }

  function badge(d: Driver) {
    if (d.approval_status !== 'approved') return <span className="badge warn">{d.approval_status}</span>;
    const lapsed = d.subscription_until && new Date(d.subscription_until) < new Date();
    return lapsed ? <span className="badge bad">subscription lapsed</span> : <span className="badge ok">active</span>;
  }

  return (
    <>
      <h1>Drivers</h1>
      <div className="row">
        <input
          placeholder="Search name, phone, vehicle"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', qInput.trim());
          }}
        />
        <button onClick={() => setParam('q', qInput.trim())}>Search</button>
        <select value={approval} onChange={(e) => setParam('approval', e.target.value)}>
          <option value="">all approvals</option>
          <option value="pending">pending KYC</option>
          <option value="approved">approved</option>
          <option value="suspended">suspended</option>
        </select>
        <select value={subscription} onChange={(e) => setParam('subscription', e.target.value)}>
          <option value="">all subscriptions</option>
          <option value="active">active</option>
          <option value="lapsed">lapsed</option>
        </select>
        <button className="primary" onClick={() => setShowSeed((s) => !s)}>
          Seed a driver
        </button>
      </div>

      {showSeed && (
        <form className="panel" onSubmit={seed}>
          <h2>New driver (approved immediately — no signup needed)</h2>
          <div className="row">
            <input
              placeholder="Phone +91…"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Vehicle no"
              value={form.vehicle_no}
              onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })}
            />
            <input
              type="number"
              placeholder="Radius km"
              value={form.radius_km}
              onChange={(e) => setForm({ ...form, radius_km: Number(e.target.value) })}
            />
            <button className="primary" type="submit">
              Create
            </button>
          </div>
          <p className="muted">
            Base location can be set on the driver detail page, or by the driver sending their
            location in WhatsApp.
          </p>
        </form>
      )}

      <Notice error={error} loading={loading} onRetry={reload} />

      {rows && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Vehicle</th>
              <th>Radius</th>
              <th>Status</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link to={`/drivers/${d.id}`}>{d.name ?? '—'}</Link>
                </td>
                <td>{d.phone}</td>
                <td>{d.vehicle_no ?? '—'}</td>
                <td>{d.radius_km} km</td>
                <td>{badge(d)}</td>
                <td>{d.rating_avg.toFixed(1)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No drivers match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
