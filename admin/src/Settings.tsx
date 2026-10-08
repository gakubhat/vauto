import { useEffect, useState } from 'react';
import { getSettings, putSettings } from './api';
import { ActionNote, Notice, useApi } from './ui';

interface SettingsData {
  quote_window_minutes: number;
  max_drivers_per_lead: number;
  default_radius_km: number;
  radius_options: number[];
  auto_pick_cheapest: boolean;
  fare_check_enabled: boolean;
  scheduling_enabled: boolean;
  trial_days: number;
  trial_min_rides: number;
  dispute_hours: number;
  scheduled_lead_hours: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  evening_dispatch_hour: number;
  scheduled_confirm_minutes: number;
  pick_deadline_minutes: number;
  lead_stage_size: number;
  lead_stage_interval_minutes: number;
  lead_stage_expand_below: number;
  template_leads_per_driver_per_day: number;
  lead_warm_band_km: number;
  subscription_price_paise: number;
  renewal_contact: string | null;
  helpline: string | null;
  office_number: string | null;
  lead_template: string;
  kyc_approved_template: string;
}

const BOUNDS: Partial<Record<keyof SettingsData, [number, number]>> = {
  quote_window_minutes: [1, 1440],
  max_drivers_per_lead: [1, 500],
  default_radius_km: [1, 100],
  trial_days: [0, 3650],
  trial_min_rides: [0, 10000],
  dispute_hours: [1, 720],
  scheduled_lead_hours: [1, 168],
  quiet_hours_start: [0, 23],
  quiet_hours_end: [0, 23],
  evening_dispatch_hour: [0, 23],
  scheduled_confirm_minutes: [1, 720],
  pick_deadline_minutes: [1, 1440],
  lead_stage_size: [1, 200],
  lead_stage_interval_minutes: [1, 120],
  lead_stage_expand_below: [0, 100],
  template_leads_per_driver_per_day: [0, 100],
  lead_warm_band_km: [0, 50],
  subscription_price_paise: [0, 100_000_000],
};

export function Settings() {
  const { data, error, loading, reload } = useApi<SettingsData>(
    () => getSettings() as Promise<SettingsData>,
  );
  const [s, setS] = useState<SettingsData | null>(null);
  const [radiusText, setRadiusText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setS(data);
      setRadiusText((data.radius_options ?? []).join(', '));
    }
  }, [data]);

  if (!s) {
    return (
      <>
        <h1>Settings</h1>
        <Notice error={error} loading={loading} onRetry={reload} />
      </>
    );
  }

  const num = (label: string, key: keyof SettingsData) => {
    const [min, max] = BOUNDS[key] ?? [undefined, undefined];
    return (
      <div className="row" key={String(key)}>
        <label style={{ width: 260 }}>{label}</label>
        <input
          type="number"
          min={min}
          max={max}
          value={s[key] as number}
          onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
          style={{ width: 120 }}
        />
        {min !== undefined && (
          <span className="muted">
            {min}–{max}
          </span>
        )}
      </div>
    );
  };

  const bool = (label: string, key: keyof SettingsData) => (
    <div className="row" key={String(key)}>
      <label style={{ width: 260 }}>{label}</label>
      <input
        type="checkbox"
        checked={s[key] as boolean}
        onChange={(e) => setS({ ...s, [key]: e.target.checked })}
      />
    </div>
  );

  const text = (label: string, key: keyof SettingsData, hint?: string) => (
    <div className="row" key={String(key)}>
      <label style={{ width: 260 }}>{label}</label>
      <input
        value={(s[key] as string | null) ?? ''}
        onChange={(e) => setS({ ...s, [key]: e.target.value || null })}
      />
      {hint && <span className="muted">{hint}</span>}
    </div>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const radii = radiusText
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => x !== 0 && !Number.isNaN(x));
    setSaving(true);
    setNote(null);
    try {
      const updated = (await putSettings({ ...s, radius_options: radii })) as SettingsData;
      setS(updated);
      setRadiusText((updated.radius_options ?? []).join(', '));
      setNote('Saved. Changes take effect immediately.');
    } catch (err) {
      setNote((err as Error).message || 'Could not save');
    }
    setSaving(false);
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Changes take effect immediately — no deploy needed.</p>
      <form className="panel" onSubmit={save}>
        {num('Quote window (minutes)', 'quote_window_minutes')}
        {num('Max drivers per lead', 'max_drivers_per_lead')}
        {num('Default radius (km)', 'default_radius_km')}
        {num('Auto-dispute after (hours)', 'dispute_hours')}
        {num('Scheduled lead hours before pickup', 'scheduled_lead_hours')}
        {num('Quiet hours start (IST, 0–23)', 'quiet_hours_start')}
        {num('Quiet hours end (IST, 0–23)', 'quiet_hours_end')}
        {num('Evening dispatch hour (IST, 0–23)', 'evening_dispatch_hour')}
        {num('Warn rider if no driver (minutes before pickup)', 'scheduled_confirm_minutes')}
        {num('Rider must pick a quote within (minutes)', 'pick_deadline_minutes')}
        {num('Drivers contacted per dispatch stage', 'lead_stage_size')}
        {num('Minutes before widening to the next stage', 'lead_stage_interval_minutes')}
        {num('Widen only while pending quotes are below', 'lead_stage_expand_below')}
        {num('Max template leads per driver per day (0 = unlimited)', 'template_leads_per_driver_per_day')}
        {num('Prefer warm drivers within (km, 0 = off)', 'lead_warm_band_km')}
        <div className="row">
          <label style={{ width: 260 }}>Radius options (km)</label>
          <input
            value={radiusText}
            onChange={(e) => setRadiusText(e.target.value)}
            style={{ width: 200 }}
          />
          <span className="muted">Comma-separated, offered to drivers at signup.</span>
        </div>
        {bool('Auto-pick cheapest at window close (off = rider chooses)', 'auto_pick_cheapest')}
        {bool('Fare check after drop', 'fare_check_enabled')}
        {bool('Offer scheduled (later) pickups', 'scheduling_enabled')}
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Off for launch: with few drivers a scheduled trip usually goes unfilled, which costs more
          trust than not offering it. The confirm card shows only <em>Book now</em> while this is off.
          Turn it on once immediate bookings reliably get quotes.
        </p>

        <h3 style={{ marginTop: 24 }}>Driver subscription</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          A driver is cut off only when <code>subscription_until</code> has passed. Approving a
          driver sets it 30 days ahead; a driver whose date is never set is never gated, which is the
          current launch position.
          <br />
          <strong>Trial days and trial minimum rides are not enforced.</strong> They are stored but
          nothing reads them. Do not rely on them to end a free period — set{' '}
          <code>subscription_until</code> on the driver instead.
        </p>
        {num('Trial days (stored, NOT enforced)', 'trial_days')}
        {num('Trial minimum rides (stored, NOT enforced)', 'trial_min_rides')}
        {num('Subscription price (paise)', 'subscription_price_paise')}
        {text('Renewal contact', 'renewal_contact')}
        {text('Helpline number', 'helpline', 'A number a person answers — the WhatsApp number cannot take calls.')}
        {text('Office alerts to', 'office_number', 'WhatsApp number that receives every help/dispute alert.')}
        {text('Lead template', 'lead_template', 'Utility template for drivers idle >24h.')}
        {text('KYC approved template', 'kyc_approved_template', 'Sent when approving a driver idle >24h.')}

        <div className="row">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <ActionNote note={note} />
      </form>
    </>
  );
}
