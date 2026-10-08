import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { t, type Lang } from '../src/whatsapp/i18n';
import * as tpl from '../src/whatsapp/templates';
import { renderWhatsApp } from '../src/whatsapp/api';
import { nextSlots } from '../src/lib/schedule';
import { nominatimLabel, shortenAddress } from '../src/lib/geocode';
import { formatRupees } from '../src/lib/money';

/**
 * WhatsApp rejects the whole message when a label is too long, and silently
 * shows the raw id when a translation key is missing. Both shipped to real
 * users, so both are asserted here rather than trusted.
 *
 * Pure - no database, no network.
 */

const ROOT = path.resolve(process.cwd(), '..');
const templatesSrc = fs.readFileSync(
  path.join(ROOT, 'server/src/whatsapp/templates.ts'),
  'utf8',
);

const LANGS: Lang[] = ['english', 'kannada'];
const TRIP = '11111111-1111-1111-1111-111111111111';
const HELPLINE = '+91 94482 67561';
// 3 Oct 2026, 2:30 PM IST - fixed so slot labels are deterministic.
const NOW = new Date('2026-10-03T09:00:00.000Z');
const YMD = { y: 2026, mo: 9, d: 3 };

/** WhatsApp's hard caps: reply button 20, list row 24, list section title 24. */
const LIMITS = { button: 20, row: 24, section: 24 };

function payload(msg: ReturnType<typeof tpl.askDone>): any {
  return renderWhatsApp('+910000000000', msg);
}

function allMessages(): Array<[string, any]> {
  const out: Array<[string, any]> = [];
  for (const lang of LANGS) {
    out.push(
      ['roleSelection', tpl.roleSelection(lang)],
      ['riderReady', tpl.riderReady(lang)],
      ['riderMenu', tpl.riderMenu(lang)],
      ['dropOptions', tpl.dropOptions(lang)],
      ['askDropTyped', tpl.askDropTyped(lang)],
      ['pickupOptions', tpl.pickupOptions(lang)],
      ['tripConfirm', tpl.tripConfirm(lang, 'A', 'B', 2, true)],
      ['scheduleSlot', tpl.scheduleSlot(lang, nextSlots(NOW), NOW)],
      ['findingAuto', tpl.findingAuto(lang, TRIP, 3)],
      ['noQuotes', tpl.noQuotes(lang, TRIP)],
      ['pickTimeout', tpl.pickTimeout(lang, TRIP)],
      ['driverTaken', tpl.driverTaken(lang)],
      ['noCover', tpl.noCover(lang, TRIP)],
      ['assignedRider', tpl.assignedRider(lang, 'N', 'V', 'P', '1234', TRIP)],
      ['completionConfirm', tpl.completionConfirm(lang, 'N')],
      ['dropProof-completed', tpl.dropProof(lang, 'completed')],
      ['dropProof-disputed', tpl.dropProof(lang, 'disputed')],
      ['disputed', tpl.disputed(lang, HELPLINE)],
      ['otpBlocked', tpl.otpBlocked(lang, HELPLINE)],
      ['kycRejected', tpl.kycRejected(lang, HELPLINE)],
      ['helpReply', tpl.helpReply(lang, HELPLINE)],
      ['fareCheck', tpl.fareCheck(lang, 'N', 7000)],
      ['cancelConfirm', tpl.cancelConfirm(lang)],
      ['kycPrompt', tpl.kycPrompt(lang, 'front')],
      ['leadMessage', tpl.leadMessage(lang, TRIP, 'F', 'N', 'T', '2 km', 'Now')],
      ['youGotTrip', tpl.youGotTrip(lang, 7000, 'R', 'P', 'PU', TRIP)],
      ['otherQuotesWithdrawn', tpl.otherQuotesWithdrawn(lang)],
      ['askStart', tpl.askStart(lang, TRIP)],
      ['askArrived', tpl.askArrived(lang, TRIP)],
      ['otpOk', tpl.otpOk(lang)],
      ['askDone', tpl.askDone(lang)],
      ['driverMenu-open', tpl.driverMenu(lang, 2)],
      ['driverMenu-none', tpl.driverMenu(lang, 0)],
      ['updateBase', tpl.updateBase(lang)],
      ['rateRider', tpl.rateRider(lang, 'R')],
      ['scheduleHour', tpl.scheduleHour(lang, YMD, [15, 16, 17], NOW)],
      ['overnightNote', tpl.overnightNote(lang)],
      ['scheduleAtRisk', tpl.scheduleAtRisk(lang, '5:00 AM', HELPLINE)],
      ['cancelReasonList-rider', tpl.cancelReasonList(lang, 'rider')],
      ['cancelReasonList-driver', tpl.cancelReasonList(lang, 'driver')],
      [
        'quoteList',
        tpl.quoteList(
          lang,
          TRIP,
          [{ id: 'q', name: 'Ramesh', vehicle: 'KA-05-1234', amountPaise: 7000, rating: 4.5 }],
          false,
        ),
      ],
    );
  }
  return out;
}

describe('whatsapp message labels', () => {
  it('every button label key exists in i18n', () => {
    const keys = [...new Set([...templatesSrc.matchAll(/btn\('([a-z_]+)'/g)].map((m) => m[1]))];
    // t() echoes the key back when it is missing - that is exactly how the
    // DONE button shipped reading "trip_done".
    const missing = keys.filter((k) => t(k, 'english') === k || t(k, 'kannada') === k);
    expect(missing).toEqual([]);
  });

  it('the DONE button reads as words, not the raw id', () => {
    for (const lang of LANGS) {
      const p = payload(tpl.askDone(lang));
      expect(p.interactive.action.buttons[0].reply.title).not.toBe('trip_done');
      expect(p.interactive.action.buttons[0].reply.title.length).toBeGreaterThan(0);
    }
  });

  it('hides the Schedule button unless scheduling is enabled', () => {
    const off = payload(tpl.tripConfirm('english', 'A', 'B', 2));
    expect(off.interactive.action.buttons.map((b: { reply: { id: string } }) => b.reply.id)).toEqual([
      'book_now',
      'cancel_booking',
    ]);
    const on = payload(tpl.tripConfirm('english', 'A', 'B', 2, true));
    expect(on.interactive.action.buttons.map((b: { reply: { id: string } }) => b.reply.id)).toEqual([
      'book_now',
      'schedule',
      'cancel_booking',
    ]);
  });

  it('cancel reason list section title fits the 24-char cap', () => {
    // Meta rejects the whole message with 131009 when this is too long, so the
    // driver never receives the cancellation prompt at all.
    for (const lang of LANGS) {
      const p = payload(tpl.cancelReasonList(lang, 'driver'));
      expect(p.interactive.action.sections[0].title.length).toBeLessThanOrEqual(LIMITS.section);
      expect(p.interactive.action.button.length).toBeLessThanOrEqual(LIMITS.button);
    }
  });

  it('every "contact the office" message carries the helpline number', () => {
    // A user sent to a human with no number to dial is a dead end.
    for (const lang of LANGS) {
      const withPhone: Array<[string, any]> = [
        ['disputed', tpl.disputed(lang, HELPLINE)],
        ['otpBlocked', tpl.otpBlocked(lang, HELPLINE)],
        ['kycRejected', tpl.kycRejected(lang, HELPLINE)],
        ['helpReply', tpl.helpReply(lang, HELPLINE)],
      ];
      for (const [name, msg] of withPhone) {
        expect(msg.body, `${name} (${lang})`).toContain(HELPLINE);
      }
      // And with nothing configured it must still say something useful.
      expect(tpl.helpReply(lang, null).body.length).toBeGreaterThan(10);
    }
  });

  it('no label in any message exceeds the WhatsApp caps', () => {
    const over: string[] = [];
    for (const [name, msg] of allMessages()) {
      const p = payload(msg);
      for (const b of p.interactive?.action?.buttons ?? []) {
        if (b.reply.title.length > LIMITS.button) over.push(`${name} button "${b.reply.title}"`);
      }
      for (const s of p.interactive?.action?.sections ?? []) {
        if ((s.title ?? '').length > LIMITS.section) over.push(`${name} section "${s.title}"`);
        for (const r of s.rows ?? []) {
          if (r.title.length > LIMITS.row) over.push(`${name} row "${r.title}"`);
        }
      }
    }
    expect(over).toEqual([]);
  });

  it("no list message exceeds WhatsApp's 10-row cap", () => {
    // Meta rejects the WHOLE list message over 10 rows (across all sections),
    // so the user receives nothing. Keep this guard: the 06:00-22:00 hour
    // picker shipped with 17 rows and was silently dropped.
    const over: string[] = [];
    for (const [name, msg] of allMessages()) {
      const p = payload(msg);
      if (p.interactive?.type !== 'list') continue;
      const rows = (p.interactive.action.sections ?? []).reduce(
        (n: number, s: { rows?: unknown[] }) => n + (s.rows?.length ?? 0),
        0,
      );
      if (rows > 10) over.push(`${name} has ${rows} rows`);
    }
    expect(over).toEqual([]);
  });
});

describe('readable addresses', () => {
  const DISPLAY = '6th Block, Sir MV Layout, Bengaluru, Karnataka 560110, India';

  it('names the area and the town, not just one field', () => {
    // Used to render as a bare "6th Block", which a driver cannot act on.
    expect(nominatimLabel({ neighbourhood: '6th Block', city: 'Bengaluru' }, DISPLAY)).toBe(
      '6th Block, Bengaluru',
    );
  });

  it('uses road, area and town when all three are known', () => {
    expect(
      nominatimLabel(
        { road: '6th Cross Road', neighbourhood: '6th Block', city: 'Bengaluru' },
        DISPLAY,
      ),
    ).toBe('6th Cross Road, 6th Block, Bengaluru');
  });

  it('falls back to the trimmed display name when only one field is known', () => {
    expect(nominatimLabel({ neighbourhood: '6th Block' }, DISPLAY)).toBe(
      '6th Block, Sir MV Layout, Bengaluru',
    );
  });

  it('never repeats the same place twice', () => {
    expect(
      nominatimLabel({ village: 'Hosapete', city: 'Hosapete' }, 'Hosapete, Karnataka 583201, India'),
    ).toBe('Hosapete');
  });

  it('drops country, state/PIN and plus codes from a raw address blob', () => {
    expect(shortenAddress(DISPLAY)).toBe('6th Block, Sir MV Layout, Bengaluru');
  });
});

/**
 * The product was renamed VAuto. A string left saying VJobs reaches a rider
 * directly, and nothing else would fail - the flow tests assert behaviour, not
 * branding. Scanning the source catches a new key written with the old name,
 * which is how the rename would creep back.
 */
describe('brand name', () => {
  const i18nSrc = fs.readFileSync(path.join(ROOT, 'server/src/whatsapp/i18n.ts'), 'utf8');

  it('never says VJobs in a user-facing string', () => {
    expect(i18nSrc).not.toMatch(/VJobs/);
    expect(i18nSrc).not.toContain('ವಿಜಾಬ್ಸ್');
  });

  it('names the product VAuto in both languages', () => {
    expect(t('welcome', 'english')).toContain('VAuto');
    expect(t('welcome', 'kannada')).toContain('ವಿಆಟೋ');
    expect(t('post_complete', 'english')).toContain('VAuto');
    expect(t('post_complete', 'kannada')).toContain('ವಿಆಟೋ');
  });
});

/**
 * Every rupee amount a rider or driver sees comes from formatRupees - the quote
 * list, the fare check, the quote confirmation, the renewal notice. Asserting
 * the sign here means a stray "Rs" or a stray space cannot creep back in.
 */
describe('money formatting', () => {
  it('uses the rupee sign, not "Rs"', () => {
    expect(formatRupees(7000)).toBe('₹70');
    expect(formatRupees(19900)).toBe('₹199');
    expect(formatRupees(7000)).not.toContain('Rs');
  });

  it('rounds paise and never shows a decimal', () => {
    expect(formatRupees(7050)).toBe('₹71');
    expect(formatRupees(1)).toBe('₹0');
  });

  it('leaves room in WhatsApp 24-character list rows', () => {
    expect(`Ramesh · ${formatRupees(7000)}`.length).toBeLessThanOrEqual(24);
  });
});
