import { Link } from 'react-router-dom';
import { getStats } from './api';
import { Notice, useApi } from './ui';

interface Stats {
  trips_today: number;
  completed_today: number;
  expired_today: number;
  unclaimed_rate: number;
  median_seconds_to_first_quote: number | null;
  pending_kyc: number;
  active_drivers: number;
  disputed_open: number;
  help_open: number;
  riders_total: number;
}

function Card({
  n,
  label,
  to,
  tone,
  hint,
}: {
  n: number | string;
  label: string;
  to?: string;
  tone?: 'warn' | 'bad';
  hint?: string;
}) {
  const body = (
    <div className={`card${to ? ' link' : ''}`} title={hint}>
      <div className={`n${tone ? ` ${tone}` : ''}`}>{n}</div>
      <div className="l">{label}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Dashboard() {
  const { data: stats, error, loading, reload } = useApi<Stats>(() => getStats() as Promise<Stats>);

  if (!stats) {
    return (
      <>
        <h1>Dashboard — last 24 hours</h1>
        <Notice error={error} loading={loading} onRetry={reload} />
      </>
    );
  }

  const needsAction = stats.pending_kyc + stats.disputed_open + stats.help_open;

  return (
    <>
      <h1>Dashboard — last 24 hours</h1>

      {needsAction > 0 && (
        <p className="notice-bad">
          {needsAction} item{needsAction === 1 ? '' : 's'} need the office:{' '}
          {stats.pending_kyc > 0 && (
            <Link to="/drivers?approval=pending">{stats.pending_kyc} pending KYC</Link>
          )}
          {stats.pending_kyc > 0 && (stats.disputed_open > 0 || stats.help_open > 0) && ' · '}
          {stats.disputed_open > 0 && (
            <Link to="/trips?status=disputed">{stats.disputed_open} disputed</Link>
          )}
          {stats.disputed_open > 0 && stats.help_open > 0 && ' · '}
          {stats.help_open > 0 && <Link to="/help">{stats.help_open} waiting for help</Link>}
        </p>
      )}

      <div className="cards">
        <Card n={stats.trips_today} label="Trips" to="/trips" />
        <Card n={stats.completed_today} label="Completed" to="/trips?status=completed" />
        <Card n={`${stats.unclaimed_rate}%`} label="Unclaimed" to="/analytics" hint="Trips that got no quote" />
        <Card
          n={
            stats.median_seconds_to_first_quote === null
              ? '—'
              : `${Math.round(stats.median_seconds_to_first_quote / 60)}m`
          }
          label="Median to first quote"
        />
        <Card n={stats.pending_kyc} label="Pending KYC" to="/drivers?approval=pending" tone={stats.pending_kyc > 0 ? 'warn' : undefined} />
        <Card n={stats.disputed_open} label="Disputed" to="/trips?status=disputed" tone={stats.disputed_open > 0 ? 'bad' : undefined} />
        <Card n={stats.help_open} label="Waiting for help" to="/help" tone={stats.help_open > 0 ? 'warn' : undefined} />
        <Card n={stats.active_drivers} label="Approved drivers" to="/drivers" />
        <Card n={stats.riders_total} label="Riders" to="/riders" />
      </div>
      <p className="muted">
        Unclaimed is the share of trips that got no quote at all — your supply gaps. Cards with a
        coloured number link to the queue that needs attention.
      </p>
    </>
  );
}
