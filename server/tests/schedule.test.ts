import { describe, it, expect } from 'vitest';
import {
  addDaysYmd,
  dayDiff,
  dispatchAt,
  hourLabel,
  inQuietWindow,
  istInstant,
  istYmd,
  needsEarlyNotice,
  nextSlots,
  slotLabel,
  slotsForDay,
  ymdKey,
} from '../src/lib/schedule';

/**
 * Scheduling runs on the server clock (usually UTC) but riders pick Indian
 * wall-clock, so every conversion here is load-bearing. Pure - no database.
 */
describe('schedule times (IST)', () => {
  it('labels hours in 12-hour form', () => {
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(3)).toBe('3 AM');
    expect(hourLabel(9)).toBe('9 AM');
    expect(hourLabel(12)).toBe('12 PM');
    expect(hourLabel(15)).toBe('3 PM');
    expect(hourLabel(21)).toBe('9 PM');
  });

  it('labels slots, collapsing the period when it does not change', () => {
    expect(slotLabel(0)).toBe('12–3 AM');
    expect(slotLabel(9)).toBe('9 AM–12 PM');
    expect(slotLabel(15)).toBe('3–6 PM');
    expect(slotLabel(21)).toBe('9 PM–12 AM');
  });

  it('converts an IST wall-clock time to the right instant', () => {
    // 3 Oct 2026, 9:00 AM IST == 03:30 UTC.
    expect(istInstant({ y: 2026, mo: 9, d: 3 }, 9).toISOString()).toBe(
      '2026-10-03T03:30:00.000Z',
    );
  });

  it('reads the IST calendar date of an instant (rolls past midnight)', () => {
    expect(istYmd(new Date('2026-10-02T20:00:00.000Z'))).toEqual({ y: 2026, mo: 9, d: 3 });
  });

  it('rolls and diffs IST dates', () => {
    const base = { y: 2026, mo: 9, d: 3 };
    expect(addDaysYmd(base, 1)).toEqual({ y: 2026, mo: 9, d: 4 });
    expect(dayDiff(base, addDaysYmd(base, 1))).toBe(1);
    expect(ymdKey(base)).toBe('20261003');
  });

  it('drops past hours and rolls the next 6 slots across days', () => {
    const day = { y: 2026, mo: 9, d: 3 };
    const now = istInstant(day, 14, 30); // 2:30 PM IST
    const slots = nextSlots(now);

    expect(slots.length).toBe(6);
    // 3/6/9 PM today, then overnight into tomorrow (12/3/6 AM).
    expect(slots.map((s) => s.start)).toEqual([15, 18, 21, 0, 3, 6]);
    expect(slots[0].ymd).toEqual(day);
    expect(slots[3].ymd).toEqual({ y: 2026, mo: 9, d: 4 });

    // Every offered exact hour is in the future.
    for (const s of slots) {
      for (const h of s.hours) {
        expect(istInstant(s.ymd, h).getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });

  it('keeps only the future hours of a slot already underway', () => {
    const day = { y: 2026, mo: 9, d: 3 };
    const now = istInstant(day, 15, 30); // inside the 3-6 PM slot
    const slot = slotsForDay(day, now).find((s) => s.start === 15);
    expect(slot?.hours).toEqual([16, 17]);
  });
});

describe('scheduled dispatch timing (quiet window)', () => {
  const plan = { leadHours: 2, quietStart: 22, quietEnd: 7, eveningHour: 21 };
  const D = { y: 2026, mo: 9, d: 3 };
  const Dprev = { y: 2026, mo: 9, d: 2 };

  it('recognises the wrapping quiet window', () => {
    expect(inQuietWindow(23, 22, 7)).toBe(true);
    expect(inQuietWindow(3, 22, 7)).toBe(true);
    expect(inQuietWindow(7, 22, 7)).toBe(false); // end is exclusive
    expect(inQuietWindow(12, 22, 7)).toBe(false);
  });

  it('dispatches a 5 AM pickup the evening before, not 3 AM', () => {
    const pickup = istInstant(D, 5);
    const at = dispatchAt(pickup, plan);
    // 21:00 the previous day in IST.
    expect(at).toEqual(istInstant(Dprev, 21));
    expect(needsEarlyNotice(pickup, plan)).toBe(true);
  });

  it('dispatches a 6 AM pickup the evening before too', () => {
    expect(dispatchAt(istInstant(D, 6), plan)).toEqual(istInstant(Dprev, 21));
  });

  it('leaves a daytime pickup at the normal lead time', () => {
    const pickup = istInstant(D, 15); // 3 PM
    expect(dispatchAt(pickup, plan)).toEqual(istInstant(D, 13));
    expect(needsEarlyNotice(pickup, plan)).toBe(false);
  });

  it('handles a just-after-midnight pickup', () => {
    // 00:30 -> normal lead is 22:30 the previous evening, inside the window.
    expect(dispatchAt(istInstant(D, 0, 30), plan)).toEqual(istInstant(Dprev, 21));
  });

  it('hides pre-dawn slots once the quiet window has started', () => {
    // 10:30 PM: too late to offer overnight - the evening-before send is gone
    // and a 3 AM send is forbidden. Tomorrow's pre-dawn is gone; the earliest
    // bookable slot slides to 9 AM. (The list may still roll far enough ahead
    // that a later night, where the evening-before is still ahead, reappears.)
    const now = istInstant(D, 22, 30);
    const slots = nextSlots(now, plan);
    expect(slots[0]).toMatchObject({ ymd: { y: 2026, mo: 9, d: 4 }, start: 9 });
    expect(slots.filter((s) => s.ymd.d === 4).every((s) => s.start >= 9)).toBe(true);
  });

  it('still offers overnight slots before the quiet window', () => {
    // 2:30 PM: a 5 AM slot is serviceable via the evening-before dispatch.
    const now = istInstant(D, 14, 30);
    const starts = nextSlots(now, plan).map((s) => s.start);
    expect(starts.some((h) => h < 9)).toBe(true);
  });
});
