/**
 * Scheduling time maths, in IST.
 *
 * The server clock is usually UTC, but riders pick times in Indian wall-clock.
 * IST is a fixed +05:30 offset (no DST), so we convert with plain arithmetic
 * instead of a timezone library. Keeping this pure means the slot logic is
 * unit-tested without a database.
 *
 * The day is offered as rolling 3-hour slots starting from now, then the exact
 * hour inside the chosen slot. Every WhatsApp list stays well under its 10-row
 * cap, and "now" naturally drops times that have already passed.
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface Ymd {
  y: number;
  mo: number; // 0-based, matching Date
  d: number;
}

export interface ScheduleSlot {
  ymd: Ymd; // IST calendar date of the slot
  start: number; // IST hour the slot starts
  hours: number[]; // exact IST hours still selectable inside the slot
}

/** A 24-hour value -> a 12-hour label, e.g. 0 -> "12 AM", 15 -> "3 PM". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${period}`;
}

/** e.g. 15 -> "3–6 PM", 9 -> "9 AM–12 PM", 21 -> "9 PM–12 AM". */
export function slotLabel(start: number): string {
  const end = start + 3;
  const samePeriod = Math.floor(((start % 24) + 24) % 24 / 12) === Math.floor((((end % 24) + 24) % 24) / 12);
  if (samePeriod) {
    const twelve = (h: number): number => (((h % 12) + 12) % 12) || 12;
    return `${twelve(start)}–${twelve(end)} ${end % 24 < 12 ? 'AM' : 'PM'}`;
  }
  return `${hourLabel(start)}–${hourLabel(end)}`;
}

/** The IST calendar date of an instant. */
export function istYmd(at: Date): Ymd {
  const t = new Date(at.getTime() + IST_OFFSET_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() };
}

export function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(ymd.y, ymd.mo, ymd.d + days));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() };
}

/** Whole days from one IST date to another. */
export function dayDiff(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.y, from.mo, from.d);
  const b = Date.UTC(to.y, to.mo, to.d);
  return Math.round((b - a) / 86_400_000);
}

/** `20261003` - a compact, sortable key for row ids. */
export function ymdKey(ymd: Ymd): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${ymd.y}${p(ymd.mo + 1)}${p(ymd.d)}`;
}

/** The instant for a given IST wall-clock date and hour. */
export function istInstant(ymd: Ymd, hour: number, minute = 0): Date {
  return new Date(Date.UTC(ymd.y, ymd.mo, ymd.d, hour, minute) - IST_OFFSET_MS);
}

// Every 3-hour boundary, including overnight.
const SLOT_STARTS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * The slots on one IST day that still have a usable exact hour. A slot whose
 * hours have all passed is dropped - this is what makes "today" shrink.
 *
 * With a `plan`, hours we could no longer give notice for are dropped too: once
 * the quiet window has started, a pre-dawn pickup whose leads should have gone
 * out the previous evening is no longer serviceable, so it is not offered.
 */
export function slotsForDay(ymd: Ymd, now: Date, plan?: LeadPlan): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  for (const start of SLOT_STARTS) {
    const hours = [start, start + 1, start + 2].filter(
      (h) =>
        istInstant(ymd, h).getTime() > now.getTime() &&
        (!plan || serviceable(ymd, h, now, plan)),
    );
    if (hours.length > 0) slots.push({ ymd, start, hours });
  }
  return slots;
}

/** Can we still send this hour's leads now (not quiet) or later (evening before)? */
function serviceable(ymd: Ymd, hour: number, now: Date, plan: LeadPlan): boolean {
  if (!inQuietWindow(istHour(now), plan.quietStart, plan.quietEnd)) return true;
  return dispatchAt(istInstant(ymd, hour), plan).getTime() > now.getTime();
}

/** The IST hour (0–23) of an instant. */
export function istHour(at: Date): number {
  return new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * Is `hour` inside the quiet window? Supports wrapping (e.g. 22 -> 7 means
 * 22,23,0..6 are quiet).
 */
export function inQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export interface LeadPlan {
  leadHours: number;
  quietStart: number;
  quietEnd: number;
  eveningHour: number;
}

/**
 * When a scheduled trip's leads should actually go out.
 *
 * Normally `pickup - leadHours`. But if that lands in the quiet window, we send
 * the previous evening instead, so a 5 AM pickup is offered at 21:00 the night
 * before (drivers awake, rider can accept when they wake) rather than at 3 AM.
 */
export function dispatchAt(pickup: Date, plan: LeadPlan): Date {
  const base = new Date(pickup.getTime() - plan.leadHours * 3_600_000);
  const hour = istHour(base);
  if (!inQuietWindow(hour, plan.quietStart, plan.quietEnd)) return base;

  const baseYmd = istYmd(base);
  // A wrapping window that caught the early hours means the evening is the day
  // before; a late-evening base (>= quietStart) keeps the same day.
  const ymd =
    plan.quietStart > plan.quietEnd && hour < plan.quietEnd
      ? addDaysYmd(baseYmd, -1)
      : baseYmd;
  return istInstant(ymd, plan.eveningHour);
}

/** True when the leads go out earlier than the normal lead time (evening before). */
export function needsEarlyNotice(pickup: Date, plan: LeadPlan): boolean {
  return dispatchAt(pickup, plan).getTime() < pickup.getTime() - plan.leadHours * 3_600_000;
}

/** The next `count` bookable slots from now, rolling across days. */
export function nextSlots(now: Date, plan?: LeadPlan, count = 6): ScheduleSlot[] {
  const out: ScheduleSlot[] = [];
  let ymd = istYmd(now);
  for (let day = 0; day < 4 && out.length < count; day += 1) {
    for (const slot of slotsForDay(ymd, now, plan)) {
      out.push(slot);
      if (out.length >= count) break;
    }
    ymd = addDaysYmd(ymd, 1);
  }
  return out;
}
