import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getRider, patchRider } from './api';
import { DeleteUserButton } from './DeleteUserButton';
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
  trips: Array<{ id: string; trip_number: number; status: string; created_at: string; quoted_amount_paise: number | null }>;
}

export function RiderDetail() {
  const { id } = useParams();
  const [r, setR] = useState<RiderDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [language, setLanguage] = useState('kannada');
  const navigate = useNavigate();

  async function load() {
    setLoadError(null);
    try {
      const row = (await getRider(id as string)) as RiderDetailData;
      setR(row);
      setLanguage(row.preferred_language === 'english' ? 'english' : 'kannada');
    } catch (e) {
      setLoadError((e as Error).message || 'Not found');
      setR(null);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  if (loadError) {
    return (
      <>
        <h1>Rider not found</h1>
        <p className="muted">{loadError}</p>
        <p className="muted">
          The record no longer exists. Note that running the test suite wipes the
          database, so anything created before a test run is gone.
        </p>
        <button onClick={() => navigate('/riders')}>Back to riders</button>
      </>
    );
  }

  if (!r) return <p>Loading…</p>;

  async function saveLanguage() {
    try {
      await patchRider(r!.id, { preferred_language: language });
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    void load();
  }

  return (
    <>
      <h1>{r.name ?? 'Unnamed rider'}</h1>
      <p className="muted">
        {r.phone} · {r.preferred_language} · rating {r.rating_avg.toFixed(1)} ({r.rating_count})
      </p>
      <p className="muted">
        Home:{' '}
        {r.home_lat !== null && r.home_lng !== null
          ? `${r.home_lat.toFixed(4)}, ${r.home_lng.toFixed(4)}`
          : r.home_text ?? 'not set'}
      </p>

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
              <td>{t.quoted_amount_paise ? `Rs ${Math.round(t.quoted_amount_paise / 100)}` : '—'}</td>
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
        <h2>Language</h2>
        <div className="row">
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="kannada">ಕನ್ನಡ</option>
            <option value="english">English</option>
          </select>
          <button onClick={() => void saveLanguage()}>Save</button>
          <span className="muted">
            Takes effect on their next message — the bot reads it fresh from this record every time.
          </span>
        </div>
      </div>

      <div className="panel">
        <h2>Danger zone</h2>
        <div className="row">
          <DeleteUserButton kind="rider" id={r.id} name={r.name ?? ''} />
          <span className="muted">
            Removes the rider, all of their trips, and everything attached to those trips.
          </span>
        </div>
      </div>
    </>
  );
}
