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
  helpline: string | null;
  office_number: string | null;
  lead_template: string;
  kyc_approved_template: string;
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
        {num('Auto-dispute after (hours)', 'dispute_hours')}
        {num('Scheduled lead hours before pickup', 'scheduled_lead_hours')}
        {bool('Auto-pick cheapest at window close (off = rider chooses)', 'auto_pick_cheapest')}
        {bool('Fare check after drop', 'fare_check_enabled')}

        <h3 style={{ marginTop: 24 }}>Driver subscription</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          A driver is cut off only when <code>subscription_until</code> has
          passed. Approving a driver sets it 30 days ahead; a driver whose date
          is never set is never gated, which is the current launch position.
          <br />
          <strong>Trial days and trial minimum rides are not enforced.</strong>{' '}
          They are stored but nothing reads them. Do not rely on them to end a
          free period — set <code>subscription_until</code> on the driver
          instead.
        </p>
        {num('Trial days (stored, NOT enforced)', 'trial_days')}
        {num('Trial minimum rides (stored, NOT enforced)', 'trial_min_rides')}
        {num('Subscription price (paise)', 'subscription_price_paise')}
        <div className="row">
          <label style={{ width: 220 }}>Renewal contact</label>
          <input
            value={s.renewal_contact ?? ''}
            onChange={(e) => setS({ ...s, renewal_contact: e.target.value })}
          />
        </div>
        <div className="row">
          <label style={{ width: 220 }}>Helpline number</label>
          <input
            value={s.helpline ?? ''}
            placeholder="+91 91487 38021"
            onChange={(e) => setS({ ...s, helpline: e.target.value })}
          />
          <span className="muted">
            Given out on "help" and everywhere the bot says contact the office. Must be a number a
            person answers — the WhatsApp number cannot take calls.
          </span>
        </div>
        <div className="row">
          <label style={{ width: 220 }}>Office alerts to</label>
          <input
            value={s.office_number ?? ''}
            placeholder="+91 91487 38021"
            onChange={(e) => setS({ ...s, office_number: e.target.value })}
          />
          <span className="muted">
            WhatsApp number that receives an alert for every help request and dispute. Needs to be
            WhatsApp-enabled, and must not be the bot&apos;s own number. Replies from it are logged
            but not answered by the bot.
          </span>
        </div>
        <div className="row">
          <label style={{ width: 220 }}>Lead template</label>
          <input
            value={s.lead_template}
            onChange={(e) => setS({ ...s, lead_template: e.target.value })}
          />
          <span className="muted">
            Sent to drivers idle &gt;24h. Must be an approved Utility template that tells them to
            reply with a price — a template has no Quote button.
          </span>
        </div>
        <div className="row">
          <label style={{ width: 220 }}>KYC approved template</label>
          <input
            value={s.kyc_approved_template}
            onChange={(e) => setS({ ...s, kyc_approved_template: e.target.value })}
          />
          <span className="muted">
            Sent when approving a driver who has not messaged in 24h. Leave it matching the name
            registered in Meta.
          </span>
        </div>
        <button className="primary" type="submit">
          Save
        </button>
      </form>
    </>
  );
}
