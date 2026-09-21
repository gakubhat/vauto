import { useEffect, useState } from 'react';
import { getAreas, getDriverStats, getFunnel } from './api';

interface Funnel {
  trips: number;
  got_quote: number;
  assigned: number;
  completed: number;
  unclaimed: number;
}

interface DriverRow {
  id: string;
  name: string | null;
  phone: string;
  vehicle_no: string | null;
  leads_sent: number;
  quotes_sent: number;
  response_rate: number;
}

interface AreaRow {
  cell: string;
  trips: number;
  unclaimed: number;
}

export function Analytics() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);

  useEffect(() => {
    void Promise.all([getFunnel(), getDriverStats(), getAreas()]).then(([f, d, a]) => {
      setFunnel(f as Funnel);
      setDrivers(d as DriverRow[]);
      setAreas(a as AreaRow[]);
    });
  }, []);

  return (
    <>
      <h1>Analytics — last 7 days</h1>

      <h2>Funnel</h2>
      {funnel && (
        <div className="cards">
          <div className="card">
            <div className="n">{funnel.trips}</div>
            <div className="l">Trips</div>
          </div>
          <div className="card">
            <div className="n">{funnel.got_quote}</div>
            <div className="l">Got a quote</div>
          </div>
          <div className="card">
            <div className="n">{funnel.assigned}</div>
            <div className="l">Assigned</div>
          </div>
          <div className="card">
            <div className="n">{funnel.completed}</div>
            <div className="l">Completed</div>
          </div>
          <div className="card">
            <div className="n">{funnel.unclaimed}</div>
            <div className="l">Unclaimed</div>
          </div>
        </div>
      )}

      <h2>Driver response rate</h2>
      <table>
        <thead>
          <tr>
            <th>Driver</th>
            <th>Vehicle</th>
            <th>Leads</th>
            <th>Quotes</th>
            <th>Response rate</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id}>
              <td>
                {d.name ?? '—'} <span className="muted">{d.phone}</span>
              </td>
              <td>{d.vehicle_no ?? '—'}</td>
              <td>{d.leads_sent}</td>
              <td>{d.quotes_sent}</td>
              <td>{d.response_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Demand by pickup area</h2>
      <table>
        <thead>
          <tr>
            <th>Cell</th>
            <th>Trips</th>
            <th>Unclaimed</th>
          </tr>
        </thead>
        <tbody>
          {areas.slice(0, 30).map((a) => (
            <tr key={a.cell}>
              <td>{a.cell}</td>
              <td>{a.trips}</td>
              <td>{a.unclaimed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
