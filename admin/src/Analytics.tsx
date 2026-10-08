import { getAreas, getDriverStats, getFunnel } from './api';
import { Notice, useApi } from './ui';

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

interface AnalyticsData {
  funnel: Funnel;
  drivers: DriverRow[];
  areas: AreaRow[];
}

export function Analytics() {
  const { data, error, loading, reload } = useApi<AnalyticsData>(async () => {
    const [f, d, a] = await Promise.all([getFunnel(), getDriverStats(30), getAreas(30)]);
    return { funnel: f as Funnel, drivers: d as DriverRow[], areas: a as AreaRow[] };
  });

  if (!data) {
    return (
      <>
        <h1>Analytics</h1>
        <Notice error={error} loading={loading} onRetry={reload} />
      </>
    );
  }

  const { funnel, drivers, areas } = data;

  return (
    <>
      <h1>Analytics</h1>

      <h2>Funnel — last 7 days</h2>
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

      <h2>Driver response rate — last 30 days</h2>
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

      <h2>Demand by pickup area — last 30 days</h2>
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
