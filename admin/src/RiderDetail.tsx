import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRider, patchRider, setRiderRole } from './api';
import { DeleteUserButton } from './DeleteUserButton';
import { Notice, useApi } from './ui';
import { RecoverPanel } from './RecoverPanel';

interface RiderDetailData {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: string;
  home_lat: number | null;
  home_lng: number | null;
  home_text: string | null;
  rating_avg: number;
  rating_count: number;
  role_override: 'rider' | 'driver' | null;
  trips: Array<{ id: string; trip_number: number; status: string; created_at: string; quoted_amount_paise: number | null }>;
}

export function RiderDetail() {
  const { id } = useParams();
  const { data: r, error, loading, reload } = useApi<RiderDetailData>(
    () => getRider(id as string) as Promise<RiderDetailData>,
    [id],
  );

  const [name, setName] = useState('');
  const [homeLat, setHomeLat] = useState('');
  const [homeLng, setHomeLng] = useState('');
  const [homeText, setHomeText] = useState('');
  const [language, setLanguage] = useState('kannada');

  useEffect(() => {
    if (!r) return;
    setName(r.name ?? '');
    setHomeLat(r.home_lat !== null ? String(r.home_lat) : '');
    setHomeLng(r.home_lng !== null ? String(r.home_lng) : '');
    setHomeText(r.home_text ?? '');
    setLanguage(r.preferred_language === 'english' ? 'english' : 'kannada');
  }, [r]);

  if (!r) {
    return (
      <>
        <h1>Rider</h1>
        <Notice error={error} loading={loading} onRetry={reload} />
      </>
    );
  }

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    void reload();
  }

  async function saveHome(riderId: string) {
    const lat = homeLat.trim() === '' ? null : Number(homeLat);
    const lng = homeLng.trim() === '' ? null : Number(homeLng);
    if ((lat === null) !== (lng === null)) {
      alert('Enter both latitude and longitude, or neither.');
      return;
    }
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      alert('Latitude and longitude must be numbers.');
      return;
    }
    await act(() =>
      patchRider(riderId, {
        name,
        home_lat: lat,
        home_lng: lng,
        home_text: homeText.trim() === '' ? null : homeText.trim(),
      }),
    );
  }

  return (
    <>
      <h1>{r.name ?? 'Unnamed rider'}</h1>
      <p className="muted">
        {r.phone} · {r.preferred_language} · rating {r.rating_avg.toFixed(1)} ({r.rating_count})
      </p>

      <div className="panel">
        <h2>Profile</h2>
        <div className="row">
          <label style={{ width: 90 }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Home lat</label>
          <input value={homeLat} onChange={(e) => setHomeLat(e.target.value)} style={{ width: 120 }} />
          <label>lng</label>
          <input value={homeLng} onChange={(e) => setHomeLng(e.target.value)} style={{ width: 120 }} />
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Home label</label>
          <input value={homeText} onChange={(e) => setHomeText(e.target.value)} />
        </div>
        <div className="row">
          <button onClick={() => void saveHome(r.id)}>Save profile</button>
          <span className="muted">Home is optional; it enables one-tap booking later.</span>
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="kannada">ಕನ್ನಡ</option>
            <option value="english">English</option>
          </select>
          <button onClick={() => void act(() => patchRider(r.id, { preferred_language: language }))}>
            Save
          </button>
          <span className="muted">Takes effect on their next message.</span>
        </div>
      </div>

      <h2>Trips</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Status</th>
            <th>Quoted</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {r.trips.map((t) => (
            <tr key={t.id}>
              <td>
                <Link to={`/trips/${t.id}`}>{t.trip_number}</Link>
              </td>
              <td>{t.status}</td>
              <td>{t.quoted_amount_paise ? `₹${Math.round(t.quoted_amount_paise / 100)}` : '—'}</td>
              <td>{new Date(t.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {r.trips.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No trips yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <RecoverPanel phone={r.phone} />

      <div className="panel">
        <h2>Role</h2>
        {r.role_override ? (
          <div className="row">
            <span className="badge warn">pinned to {r.role_override}</span>
            <button onClick={() => void act(() => setRiderRole(r.id, 'auto'))}>Clear override</button>
            <span className="muted">Let the role resolve from the tables again.</span>
          </div>
        ) : (
          <div className="row">
            <button onClick={() => void act(() => setRiderRole(r.id, 'driver'))}>
              Switch this phone to the driver flow
            </button>
            <span className="muted">Only for a wrong Rider/Driver choice. Sticks across session cleanup.</span>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Danger zone</h2>
        <div className="row">
          <DeleteUserButton kind="rider" id={r.id} name={r.name ?? ''} />
          <span className="muted">Removes the rider, all of their trips, and everything attached to those trips.</span>
        </div>
      </div>
    </>
  );
}
