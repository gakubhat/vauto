import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createDriver, getDrivers } from './api';

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
  const [rows, setRows] = useState<Driver[]>([]);
  const [q, setQ] = useState('');
  const [showSeed, setShowSeed] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', vehicle_no: '', radius_km: 3 });

  async function load() {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    setRows((await getDrivers(params)) as Driver[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function seed(e: React.FormEvent) {
    e.preventDefault();
    await createDriver({ ...form, approval_status: 'approved' });
    setForm({ phone: '', name: '', vehicle_no: '', radius_km: 3 });
    setShowSeed(false);
    void load();
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
        <input placeholder="Search name, phone, vehicle" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => void load()}>Search</button>
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
        </tbody>
      </table>
    </>
  );
}
