import { useEffect, useState } from 'react';
import { getStats } from './api';

export function Dashboard() {
  const [stats, setStats] = useState<Record<string, number | null> | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  if (!stats) return <p>Loading…</p>;

  return (
    <>
      <h1>Dashboard — last 24 hours</h1>
      <div className="cards">
        <div className="card">
          <div className="n">{stats.trips_today as number}</div>
          <div className="l">Trips</div>
        </div>
        <div className="card">
          <div className="n">{stats.completed_today as number}</div>
          <div className="l">Completed</div>
        </div>
        <div className="card">
          <div className="n">{stats.unclaimed_rate as number}%</div>
          <div className="l">Unclaimed</div>
        </div>
        <div className="card">
          <div className="n">
            {stats.median_seconds_to_first_quote === null
              ? '—'
              : `${Math.round((stats.median_seconds_to_first_quote as number) / 60)}m`}
          </div>
          <div className="l">Median to first quote</div>
        </div>
        <div className="card">
          <div className="n">{stats.pending_kyc as number}</div>
          <div className="l">Pending KYC</div>
        </div>
        <div className="card">
          <div className="n">{stats.disputed_open as number}</div>
          <div className="l">Disputed</div>
        </div>
        <div className="card">
          <div className="n">{stats.active_drivers as number}</div>
          <div className="l">Approved drivers</div>
        </div>
        <div className="card">
          <div className="n">{stats.riders_total as number}</div>
          <div className="l">Riders</div>
        </div>
      </div>
      <p className="muted">
        Unclaimed is the share of trips that got no quote at all — your supply gaps.
      </p>
    </>
  );
}
