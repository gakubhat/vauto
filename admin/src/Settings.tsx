import { useEffect, useState } from 'react';
import { getSettings, putSettings } from './api';

interface SettingsData {
  quote_window_minutes: number;
  max_drivers_per_lead: number;
  default_radius_km: number;
  auto_pick_cheapest: boolean;
  fare_check_enabled: boolean;
  trial_days: number;
  trial_min_rides: number;
  dispute_hours: number;
  scheduled_lead_hours: number;
  subscription_price_paise: number;
  renewal_contact: string | null;
}

export function Settings() {
  const [s, setS] = useState<SettingsData | null>(null);

  useEffect(() => {
    void getSettings().then((row) => setS(row as SettingsData));
  }, []);

  if (!s) return <p>Loading…</p>;

  const num = (label: string, key: keyof SettingsData) => (
    <div className="row" key={String(key)}>
      <label style={{ width: 220 }}>{label}</label>
      <input
        type="number"
        value={s[key] as number}
        onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
        style={{ width: 110 }}
      />
    </div>
  );

  const bool = (label: string, key: keyof SettingsData) => (
    <div className="row" key={String(key)}>
      <label style={{ width: 220 }}>{label}</label>
      <input
        type="checkbox"
        checked={s[key] as boolean}
        onChange={(e) => setS({ ...s, [key]: e.target.checked })}
      />
    </div>
  );

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Changes take effect immediately — no deploy needed.</p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void putSettings(s);
        }}
      >
        {num('Quote window (minutes)', 'quote_window_minutes')}
        {num('Max drivers per lead', 'max_drivers_per_lead')}
        {num('Default radius (km)', 'default_radius_km')}
        {num('Trial days', 'trial_days')}
        {num('Trial minimum rides', 'trial_min_rides')}
        {num('Auto-dispute after (hours)', 'dispute_hours')}
        {num('Scheduled lead hours before pickup', 'scheduled_lead_hours')}
        {num('Subscription price (paise)', 'subscription_price_paise')}
        {bool('Auto-pick cheapest at window close', 'auto_pick_cheapest')}
        {bool('Fare check after drop', 'fare_check_enabled')}
        <div className="row">
          <label style={{ width: 220 }}>Renewal contact</label>
          <input
            value={s.renewal_contact ?? ''}
            onChange={(e) => setS({ ...s, renewal_contact: e.target.value })}
          />
        </div>
        <button className="primary" type="submit">
          Save
        </button>
      </form>
    </>
  );
}
