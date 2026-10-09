import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getDriver, patchDriver, recordSubscription, requestDriverKyc, setApproval, setDriverRole, uploadDriverKyc } from './api';
import { DeleteUserButton } from './DeleteUserButton';
import { KycImage } from './KycImage';
import { RecoverPanel } from './RecoverPanel';

interface DriverDetailData {
  id: string;
  phone: string;
  name: string | null;
  vehicle_no: string | null;
  base_lat: number | null;
  base_lng: number | null;
  base_text: string | null;
  radius_km: number;
  approval_status: string;
  preferred_language: string;
  aadhaar_no: string | null;
  vehicle_verified: boolean;
  kyc_aadhaar_url: string | null;
  kyc_aadhaar_back_url: string | null;
  kyc_selfie_url: string | null;
  subscription_until: string | null;
  rating_avg: number;
  rating_count: number;
  role_override: 'rider' | 'driver' | null;
  trips: Array<{ id: string; trip_number: number; status: string; quoted_amount_paise: number | null }>;
  subscriptions: Array<{ id: string; paid_amount_paise: number; paid_via: string; valid_until: string }>;
  metrics: { leads_sent: number; quotes_sent: number; quotes_won: number; response_rate: number };
}

/** The three documents the office can add on a driver's behalf. */
const KYC_UPLOADS: Array<[string, string]> = [
  ['aadhaar_front', 'Aadhaar front'],
  ['aadhaar_back', 'Aadhaar back'],
  ['selfie', 'Selfie'],
];

export function DriverDetail() {
  const { id } = useParams();
  const [d, setD] = useState<DriverDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [radius, setRadius] = useState(3);
  const [amount, setAmount] = useState(19900);
  const [days, setDays] = useState(30);
  const [name, setName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [baseLat, setBaseLat] = useState('');
  const [baseLng, setBaseLng] = useState('');
  const [baseText, setBaseText] = useState('');
  const [language, setLanguage] = useState('kannada');

  async function load() {
    setLoadError(null);
    let row: DriverDetailData;
    try {
      row = (await getDriver(id as string)) as DriverDetailData;
    } catch (e) {
      setLoadError((e as Error).message || 'Not found');
      setD(null);
      return;
    }
    setD(row);
    if (!row) return;
    setRadius(row.radius_km);
    setName(row.name ?? '');
    setVehicle(row.vehicle_no ?? '');
    setAadhaar(row.aadhaar_no ?? '');
    setBaseLat(typeof row.base_lat === 'number' ? String(row.base_lat) : '');
    setBaseLng(typeof row.base_lng === 'number' ? String(row.base_lng) : '');
    setBaseText(row.base_text ?? '');
    setLanguage(row.preferred_language === 'english' ? 'english' : 'kannada');
  }

  useEffect(() => {
    void load();
  }, [id]);

  if (loadError) {
    return (
      <>
        <h1>Driver not found</h1>
        <p className="muted">{loadError}</p>
        <p className="muted">
          The record no longer exists. Note that running the test suite wipes the
          database, so anything created before a test run is gone.
        </p>
        <button onClick={() => navigate('/drivers')}>
          Back to drivers
        </button>
      </>
    );
  }

  if (!d) return <p>Loading…</p>;

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    void load();
  }

  // Matching runs on coordinates, so base is edited as numbers. Both or neither.
  async function saveBase(id: string) {
    const lat = baseLat.trim() === '' ? null : Number(baseLat);
    const lng = baseLng.trim() === '' ? null : Number(baseLng);
    if ((lat === null) !== (lng === null)) {
      alert('Enter both latitude and longitude, or neither.');
      return;
    }
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      alert('Latitude and longitude must be numbers.');
      return;
    }
    await act(() =>
      patchDriver(id, {
        base_lat: lat,
        base_lng: lng,
        base_text: baseText.trim() === '' ? null : baseText.trim(),
      }),
    );
  }

  async function uploadKyc(slot: string, file: File | undefined) {
    if (!file) return;
    await act(() => uploadDriverKyc(d!.id, slot, file));
  }

  return (
    <>
      <h1>
        {d.name ?? 'Unnamed'} <span className={`badge ${d.approval_status === 'approved' ? 'ok' : 'warn'}`}>{d.approval_status}</span>
      </h1>
      <p className="muted">
        {d.phone} · {d.vehicle_no ?? 'no vehicle'} · rating {d.rating_avg.toFixed(1)} ({d.rating_count})
      </p>

      <div className="cards">
        <div className="card">
          <div className="n">{d.metrics.leads_sent}</div>
          <div className="l">Leads sent</div>
        </div>
        <div className="card">
          <div className="n">{d.metrics.quotes_sent}</div>
          <div className="l">Quotes sent</div>
        </div>
        <div className="card">
          <div className="n">{d.metrics.response_rate}%</div>
          <div className="l">Response rate</div>
        </div>
        <div className="card">
          <div className="n">{d.metrics.quotes_won}</div>
          <div className="l">Trips won</div>
        </div>
      </div>

      <div className="panel">
        <h2>Identity</h2>
        <div className="row">
          <label style={{ width: 90 }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Auto no</label>
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          <button
            onClick={() => void act(() => patchDriver(d.id, { name, vehicle_no: vehicle }))}
          >
            Save
          </button>
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Aadhaar</label>
          <input value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} />
          <button onClick={() => void act(() => patchDriver(d.id, { aadhaar_no: aadhaar }))}>
            Save
          </button>
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="kannada">ಕನ್ನಡ</option>
            <option value="english">English</option>
          </select>
          <button onClick={() => void act(() => patchDriver(d.id, { preferred_language: language }))}>
            Save
          </button>
          <span className="muted">
            Takes effect on their next message — the bot reads it fresh from this record every time.
          </span>
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Auto verified</label>
          {d.vehicle_verified ? (
            <span className="badge ok">verified</span>
          ) : (
            <span className="badge warn">not verified</span>
          )}
          <button
            onClick={() => void act(() => patchDriver(d.id, { vehicle_verified: !d.vehicle_verified }))}
          >
            {d.vehicle_verified ? 'Unverify' : 'Mark verified'}
          </button>
          <span className="muted">
            Office confirms the plate matches the driver before ticking this.
          </span>
        </div>
      </div>

      <div className="panel">
        <h2>KYC</h2>
        <div className="row">
          <KycImage src={d.kyc_aadhaar_url} alt="Aadhaar front" />
          <KycImage src={d.kyc_aadhaar_back_url} alt="Aadhaar back" />
          <KycImage src={d.kyc_selfie_url} alt="Selfie" />
          {!d.kyc_aadhaar_url && !d.kyc_selfie_url && (
            <p className="muted">No documents uploaded. Add them below, or ask the driver to send them.</p>
          )}
          {(d.kyc_aadhaar_url || d.kyc_selfie_url) && (
            <p className="muted">Links expire after 1 hour - reload the page for fresh ones.</p>
          )}
        </div>
        <div className="row">
          <span className="muted">Add or replace a document (image, max 5 MB):</span>
        </div>
        <div className="row">
          {KYC_UPLOADS.map(([slot, label]) => (
            <label key={slot} style={{ marginRight: 16 }}>
              <span className="muted">{label}</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'block' }}
                onChange={(e) => void uploadKyc(slot, e.target.files?.[0])}
              />
            </label>
          ))}
        </div>
        {d.approval_status !== 'approved' && (
          <div className="row">
            <button onClick={() => void act(() => requestDriverKyc(d.id))}>
              Ask the driver to send documents
            </button>
            <span className="muted">
              Sends the KYC prompt on WhatsApp. Works only within 24h of the driver's
              last message; otherwise upload above.
            </span>
          </div>
        )}
        <div className="row">
          {d.approval_status === 'approved' ? (
            <>
              <span className="badge ok">Approved</span>
              <button onClick={() => void act(() => setApproval(d.id, 'suspend'))}>Suspend</button>
              <span className="muted">
                Already approved - verify or suspend instead. Re-approving only resets the trial.
              </span>
            </>
          ) : (
            <>
              <button className="primary" onClick={() => void act(() => setApproval(d.id, 'approve'))}>
                Approve
              </button>
              <button className="danger" onClick={() => void act(() => setApproval(d.id, 'reject'))}>
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Coverage</h2>
        <p className="muted">
          Base:{' '}
          {typeof d.base_lat === 'number' && typeof d.base_lng === 'number'
            ? `${d.base_lat.toFixed(4)}, ${d.base_lng.toFixed(4)}`
            : d.base_text ?? 'not set'}{' '}
          {typeof d.base_lat === 'number' && typeof d.base_lng === 'number' && (
            <a
              href={`https://www.google.com/maps?q=${d.base_lat},${d.base_lng}`}
              target="_blank"
              rel="noreferrer"
            >
              map
            </a>
          )}
        </p>
        <div className="row">
          <label style={{ width: 90 }}>Base lat</label>
          <input value={baseLat} onChange={(e) => setBaseLat(e.target.value)} style={{ width: 120 }} />
          <label>lng</label>
          <input value={baseLng} onChange={(e) => setBaseLng(e.target.value)} style={{ width: 120 }} />
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Label</label>
          <input value={baseText} onChange={(e) => setBaseText(e.target.value)} />
        </div>
        <div className="row">
          <button onClick={() => void saveBase(d.id)}>Save base location</button>
          <span className="muted">
            Right-click the waiting spot in Google Maps and paste the two numbers.
          </span>
        </div>
        <div className="row">
          <label style={{ width: 90 }}>Radius (km)</label>
          <input
            type="number"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <button onClick={() => void act(() => patchDriver(d.id, { radius_km: radius }))}>
            Save radius
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Subscription</h2>
        <p className="muted">
          Until: {d.subscription_until ? new Date(d.subscription_until).toLocaleString() : 'not set'}
        </p>
        <div className="row">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ width: 110 }}
          />
          <span className="muted">paise</span>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span className="muted">days</span>
          <select id="via" defaultValue="cash">
            <option value="cash">cash</option>
            <option value="qr">qr</option>
          </select>
          <button
            className="primary"
            onClick={() =>
              void act(() =>
                recordSubscription(d.id, {
                  paid_amount_paise: amount,
                  paid_via: (document.getElementById('via') as HTMLSelectElement).value,
                  valid_until: new Date(Date.now() + days * 86400000).toISOString(),
                }),
              )
            }
          >
            Record offline payment
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Paid</th>
              <th>Amount</th>
              <th>Via</th>
              <th>Valid until</th>
            </tr>
          </thead>
          <tbody>
            {d.subscriptions.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.valid_until).toLocaleDateString()}</td>
                <td>₹{Math.round(s.paid_amount_paise / 100)}</td>
                <td>{s.paid_via}</td>
                <td>{new Date(s.valid_until).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Trips</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Quoted</th>
            </tr>
          </thead>
          <tbody>
            {d.trips.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/trips/${t.id}`}>{t.trip_number}</Link>
                </td>
                <td>{t.status}</td>
                <td>{t.quoted_amount_paise ? `₹${Math.round(t.quoted_amount_paise / 100)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RecoverPanel phone={d.phone} />

      <div className="panel">
        <h2>Role</h2>
        {d.role_override ? (
          <div className="row">
            <span className="badge warn">pinned to {d.role_override}</span>
            <button onClick={() => void act(() => setDriverRole(d.id, 'auto'))}>Clear override</button>
            <span className="muted">Let the role resolve from the tables again.</span>
          </div>
        ) : (
          <div className="row">
            <button onClick={() => void act(() => setDriverRole(d.id, 'rider'))}>
              Switch this phone to the rider flow
            </button>
            <span className="muted">
              Only for a wrong Rider/Driver choice. Pins the role across session cleanup.
            </span>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Danger zone</h2>
        <div className="row">
          <DeleteUserButton kind="driver" id={d.id} name={d.name ?? ''} />
          <span className="muted">
            Removes the driver, their quotes, dispatches, subscription, session and KYC documents.
            Trips they drove are kept but anonymised, since those belong to riders.
          </span>
        </div>
      </div>
    </>
  );
}
