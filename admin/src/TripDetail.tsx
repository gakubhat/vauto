import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTrip, setTripStatus } from './api';

interface TripDetailData {
  id: string;
  trip_number: number;
  status: string;
  rider_id: string;
  driver_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_text: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  drop_text: string | null;
  dispute_lat: number | null;
  dispute_lng: number | null;
  dispute_text: string | null;
  distance_km: number | null;
  pickup_at: string | null;
  quote_window_closes_at: string | null;
  quoted_amount_paise: number | null;
  reported_fare_paise: number | null;
  quotes: Array<{ id: string; driver_id: string; amount_paise: number; status: string }>;
  dispatches: Array<{ driver_id: string; distance_km: number; sent_at: string; delivered_at: string | null; read_at: string | null }>;
  events: Array<{ id: string; at: string; type: string; properties: Record<string, unknown> }>;
  messages: Array<{ id: string; phone: string; direction: string; body: string; created_at: string }>;
}

export function TripDetail() {
  const { id } = useParams();
  const [t, setT] = useState<TripDetailData | null>(null);

  async function load() {
    setT((await getTrip(id as string)) as TripDetailData);
  }

  useEffect(() => {
    void load();
  }, [id]);

  if (!t) return <p>Loading…</p>;

  // `typeof` rather than `!== null`: a column that is absent (older row, or a
  // migration not yet applied) arrives as undefined, not null.
  const map = (lat: number | null | undefined, lng: number | null | undefined) =>
    typeof lat === 'number' && typeof lng === 'number'
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const coords = (lat: number | null | undefined, lng: number | null | undefined) =>
    typeof lat === 'number' && typeof lng === 'number'
      ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      : null;

  const hasDispute = typeof t.dispute_lat === 'number' || Boolean(t.dispute_text);

  return (
    <>
      <h1>
        Trip #{t.trip_number}{' '}
        <span className={`badge ${t.status === 'completed' ? 'ok' : t.status === 'disputed' ? 'bad' : 'warn'}`}>
          {t.status}
        </span>
      </h1>
      <p className="muted">
        Rider <Link to={`/riders/${t.rider_id}`}>{t.rider_id.slice(0, 8)}</Link>
        {t.driver_id && (
          <>
            {' '}
            · Driver <Link to={`/drivers/${t.driver_id}`}>{t.driver_id.slice(0, 8)}</Link>
          </>
        )}
      </p>

      <div className="panel">
        <h2>Route</h2>
        <p>
          From {t.pickup_text ?? coords(t.pickup_lat, t.pickup_lng) ?? '—'}{' '}
          {map(t.pickup_lat, t.pickup_lng) && (
            <a href={map(t.pickup_lat, t.pickup_lng) as string} target="_blank" rel="noreferrer">
              map
            </a>
          )}
        </p>
        <p>
          To {t.drop_text ?? coords(t.drop_lat, t.drop_lng) ?? '—'}{' '}
          {map(t.drop_lat, t.drop_lng) && (
            <a href={map(t.drop_lat, t.drop_lng) as string} target="_blank" rel="noreferrer">
              map
            </a>
          )}
        </p>
        {hasDispute && (
          <p>
            <span className="badge bad">disputed</span> Disputed from{' '}
            {t.dispute_text ?? coords(t.dispute_lat, t.dispute_lng) ?? '—'}{' '}
            {map(t.dispute_lat, t.dispute_lng) && (
              <a href={map(t.dispute_lat, t.dispute_lng) as string} target="_blank" rel="noreferrer">
                map
              </a>
            )}
          </p>
        )}
        <p className="muted">
          {t.distance_km ?? '?'} km · window closes{' '}
          {t.quote_window_closes_at ? new Date(t.quote_window_closes_at).toLocaleString() : '—'}
          {t.pickup_at && ` · scheduled ${new Date(t.pickup_at).toLocaleString()}`}
        </p>
        <p className="muted">
          Quoted {t.quoted_amount_paise ? `Rs ${Math.round(t.quoted_amount_paise / 100)}` : '—'} ·
          reported {t.reported_fare_paise ? `Rs ${Math.round(t.reported_fare_paise / 100)}` : '—'}
        </p>
      </div>

      <div className="panel">
        <h2>Quotes</h2>
        <table>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {t.quotes.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link to={`/drivers/${q.driver_id}`}>{q.driver_id.slice(0, 8)}</Link>
                </td>
                <td>Rs {Math.round(q.amount_paise / 100)}</td>
                <td>{q.status}</td>
              </tr>
            ))}
            {t.quotes.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No quotes received.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Lead dispatches ({t.dispatches.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Distance</th>
              <th>Sent</th>
              <th>Delivered</th>
              <th>Read</th>
            </tr>
          </thead>
          <tbody>
            {t.dispatches.map((d) => (
              <tr key={d.driver_id}>
                <td>
                  <Link to={`/drivers/${d.driver_id}`}>{d.driver_id.slice(0, 8)}</Link>
                </td>
                <td>{d.distance_km?.toFixed(2)} km</td>
                <td>{new Date(d.sent_at).toLocaleTimeString()}</td>
                <td>{d.delivered_at ? 'yes' : '—'}</td>
                <td>{d.read_at ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Timeline</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Properties</th>
            </tr>
          </thead>
          <tbody>
            {t.events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.at).toLocaleTimeString()}</td>
                <td>{e.type}</td>
                <td>
                  <pre>{JSON.stringify(e.properties)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Messages</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Phone</th>
              <th>Direction</th>
              <th>Body</th>
            </tr>
          </thead>
          <tbody>
            {t.messages.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.created_at).toLocaleTimeString()}</td>
                <td>{m.phone}</td>
                <td>{m.direction}</td>
                <td>{m.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Office actions</h2>
        <div className="row">
          {['completed', 'cancelled', 'disputed', 'open'].map((s) => (
            <button key={s} onClick={() => void setTripStatus(t.id, s).then(load)}>
              Mark {s}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
