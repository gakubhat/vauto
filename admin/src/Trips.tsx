import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrips } from './api';

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

export function Trips() {
  const [rows, setRows] = useState<Trip[]>([]);
  const [status, setStatus] = useState('');

  async function load() {
    setRows((await getTrips(status ? `?status=${status}` : '')) as Trip[]);
  }

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <>
      <h1>Trips</h1>
      <div className="row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'all statuses'}
            </option>
          ))}
        </select>
      </div>
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
              <td>{t.quoted_amount_paise ? `Rs ${Math.round(t.quoted_amount_paise / 100)}` : '—'}</td>
              <td>{new Date(t.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
