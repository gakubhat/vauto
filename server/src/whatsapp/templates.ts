import { formatRupees, type Paise } from '../lib/money';
import {
  dayDiff,
  hourLabel,
  istYmd,
  slotLabel,
  ymdKey,
  type ScheduleSlot,
  type Ymd,
} from '../lib/schedule';
import { t, type Lang } from './i18n';
import type { Button, OutMessage } from './spec';

function btn(key: string, id: string, lang: Lang): Button {
  return { id, title: t(key, lang) };
}

// ─────────────────────────── Shared ───────────────────────────

export function roleSelection(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('role_prompt', lang),
    buttons: [btn('role_rider', 'role_rider', lang), btn('role_driver', 'role_driver', lang)],
  };
}

/**
 * First message to a number we have never seen. Inherently bilingual - we do
 * not know their language yet, so the body shows both and the buttons are
 * language names.
 */
export function welcomeAndLanguage(): OutMessage {
  return {
    kind: 'buttons',
    body: [
      t('welcome', 'english'),
      t('welcome', 'kannada'),
      '',
      `${t('language_menu', 'english')} / ${t('language_menu', 'kannada')}`,
    ].join('\n'),
    buttons: [
      { id: 'lang_kannada', title: 'ಕನ್ನಡ' },
      { id: 'lang_english', title: 'English' },
    ],
  };
}

export function languageMenu(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('language_menu', lang),
    buttons: [
      { id: 'lang_kannada', title: 'ಕನ್ನಡ' },
      { id: 'lang_english', title: 'English' },
    ],
  };
}

export function text(body: string): OutMessage {
  return { kind: 'text', body };
}

// ─────────────────────────── Rider ───────────────────────────

export function askName(lang: Lang): OutMessage {
  return { kind: 'text', body: t('ask_name', lang) };
}

/** The three things a rider can do from a resting point. Tappable, not typed. */
function riderMenuButtons(lang: Lang): Button[] {
  return [
    btn('book_auto', 'book_auto', lang),
    btn('menu_help', 'help', lang),
    btn('menu_language', 'language', lang),
  ];
}

/** End of signup: clear next actions, no keyword to remember. */
export function riderReady(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('rider_ready', lang),
    buttons: riderMenuButtons(lang),
  };
}

/** Closing message for a rider - same menu, so the next action is always visible. */
export function riderPostComplete(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('post_complete', lang),
    buttons: riderMenuButtons(lang),
  };
}

/** Shown for any unrecognised idle input, so nobody has to learn keywords. */
export function riderMenu(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('rider_menu', lang),
    buttons: riderMenuButtons(lang),
  };
}

/**
 * Options for the drop step. A location request cannot carry a reply button, so
 * this is sent as a second bubble: an explicit "type it instead" path for people
 * who don't realise a plain text reply works, plus Cancel.
 */
export function dropOptions(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('drop_options', lang),
    buttons: [
      btn('type_drop', 'type_drop', lang),
      btn('cancel_booking', 'cancel_booking', lang),
    ],
  };
}

/** After tapping "Type the destination": prompts for the typed area name. */
export function askDropTyped(lang: Lang): OutMessage {
  return { kind: 'text', body: t('ask_drop_typed', lang) };
}

/**
 * A way out when a rider is stuck on the pickup step (typed instead of tapping
 * the location button). Sent as a second bubble - a location request cannot
 * carry a reply button.
 */
export function pickupOptions(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('pickup_options', lang),
    buttons: [btn('cancel_booking', 'cancel_booking', lang)],
  };
}

export function askPickup(lang: Lang): OutMessage {
  return {
    kind: 'location_request',
    body: `${t('ask_pickup', lang)}\n\n${t('location_hint_select', lang)}`,
  };
}

/** Re-prompt when pickup arrives as text. Matching needs coordinates. */
export function needLocation(lang: Lang): OutMessage {
  return { kind: 'location_request', body: t('need_location', lang) };
}

export function askDrop(lang: Lang): OutMessage {
  return {
    kind: 'location_request',
    body: `${t('ask_drop', lang)}\n\n${t('location_hint_type', lang)}`,
  };
}

export function tripConfirm(
  lang: Lang,
  pickup: string,
  drop: string,
  distanceKm: number | null,
  scheduling = false,
): OutMessage {
  return {
    kind: 'buttons',
    body: t('confirm_card', lang, {
      pickup,
      drop,
      distance: distanceKm != null ? t('confirm_distance', lang, { distance: distanceKm }) : '',
    }),
    // Scheduling is hidden while supply is thin - one clear action is better
    // than two, and an unfulfilled scheduled trip costs more trust than it buys.
    buttons: scheduling
      ? [btn('book_now', 'book_now', lang), btn('schedule', 'schedule', lang), btn('cancel_booking', 'cancel_booking', lang)]
      : [btn('book_now', 'book_now', lang), btn('cancel_booking', 'cancel_booking', lang)],
    footer: t('unknown_place', lang),
  };
}

/** Rolling 3-hour slots, each labelled with its day ("3–6 PM today"). */
export function scheduleSlot(lang: Lang, slots: ScheduleSlot[], now: Date): OutMessage {
  const today = istYmd(now);
  return {
    kind: 'list',
    body: t('schedule_slot', lang),
    button: t('choose_time', lang),
    sections: [
      {
        title: t('choose_time', lang),
        rows: slots.map((s) => ({
          id: `slot_${ymdKey(s.ymd)}_${s.start}`,
          title: `${slotLabel(s.start)} ${dayWord(today, s.ymd, lang)}`,
        })),
      },
    ],
  };
}

/** One day word for a slot/row label. Rolls at most into tomorrow. */
function dayWord(today: Ymd, ymd: Ymd, lang: Lang): string {
  return dayDiff(today, ymd) <= 0 ? t('today', lang) : t('tomorrow', lang);
}

/** Sent when an early-morning trip will be offered to drivers the evening before. */
export function overnightNote(lang: Lang): OutMessage {
  return { kind: 'text', body: t('schedule_overnight_note', lang) };
}

/** Sent shortly before an overnight pickup that still has no driver. */
export function scheduleAtRisk(lang: Lang, time: string, phone: string): OutMessage {
  return { kind: 'text', body: t('schedule_at_risk', lang, { time, phone }) };
}

/**
 * The exact hours inside a chosen slot. One list, at most 3 rows, labelled in
 * 12-hour form and carrying the day.
 */
export function scheduleHour(lang: Lang, ymd: Ymd, hours: number[], now: Date): OutMessage {
  const word = dayWord(istYmd(now), ymd, lang);
  return {
    kind: 'list',
    body: t('schedule_hour', lang),
    button: t('schedule_hour', lang),
    sections: [
      {
        title: t('schedule_hour', lang),
        rows: hours.map((h) => ({
          id: `hour_${ymdKey(ymd)}_${h}`,
          title: `${hourLabel(h)} ${word}`,
        })),
      },
    ],
  };
}

/**
 * Carries a Cancel button - a rider must never have to type "cancel".
 * `notified` is the driver count dispatch actually reached, or undefined when
 * it is not known yet (scheduled trip, leads still held back).
 */
export function findingAuto(lang: Lang, tripId: string, notified?: number): OutMessage {
  const body =
    notified == null
      ? t('finding_auto', lang)
      : t(notified === 1 ? 'finding_auto_told_one' : 'finding_auto_told', lang, {
          count: notified,
        });
  return {
    kind: 'buttons',
    body,
    buttons: [btn('cancel', `cancel_trip_${tripId}`, lang)],
  };
}

export interface QuoteListItem {
  id: string;
  name: string;
  vehicle: string;
  amountPaise: Paise;
  rating: number;
}

/** One tappable list of pending quotes. WhatsApp caps a list at 10 rows, so we
 *  show 9 quotes plus Cancel. Each new quote re-sends the whole list. */
export function quoteList(
  lang: Lang,
  tripId: string,
  quotes: QuoteListItem[],
  windowClosed: boolean,
): OutMessage {
  const shown = quotes.slice(0, 9);
  return {
    kind: 'list',
    body: t(
      windowClosed ? 'quote_list_closed' : quotes.length === 1 ? 'quote_list_body_one' : 'quote_list_body',
      lang,
      { count: quotes.length },
    ),
    button: t('pick_auto', lang),
    sections: [
      {
        title: t('quote_list_title', lang),
        rows: [
          ...shown.map((q) => ({
            id: `accept_quote_${q.id}`,
            title: `${q.name} · ${formatRupees(q.amountPaise)}`,
            // A labelled rating, not a bare number - otherwise
            // "KA-05-1234 · 4.5" could read as anything.
            description: `${q.vehicle} · ${
              q.rating > 0
                ? t('quote_rating', lang, { rating: q.rating.toFixed(1) })
                : t('new_driver', lang)
            }`,
          })),
          { id: `cancel_trip_${tripId}`, title: t('cancel', lang) },
        ],
      },
    ],
  };
}

export function noQuotes(lang: Lang, tripId: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('no_quotes', lang),
    buttons: [
      btn('try_again', `retry_${tripId}`, lang),
      btn('change_details', `change_trip_${tripId}`, lang),
    ],
  };
}

/** The rider had quotes and a deadline to pick, and did not. */
export function pickTimeout(lang: Lang, tripId: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('pick_timeout', lang),
    buttons: [
      btn('try_again', `retry_${tripId}`, lang),
      btn('change_details', `change_trip_${tripId}`, lang),
    ],
  };
}

/** A rider's chosen driver was taken by another rider first. */
export function driverTaken(lang: Lang): OutMessage {
  return { kind: 'text', body: t('driver_taken', lang) };
}

/** Nobody was even notified - distinct from "notified but nobody quoted". */
export function noCover(lang: Lang, tripId: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('no_cover', lang),
    buttons: [
      btn('try_again', `retry_${tripId}`, lang),
      btn('change_details', `change_trip_${tripId}`, lang),
    ],
  };
}

export function assignedRider(
  lang: Lang,
  name: string,
  vehicle: string,
  phone: string,
  code: string,
  tripId: string,
): OutMessage {
  return {
    kind: 'buttons',
    body: t('assigned_rider', lang, { name, vehicle, phone, code }),
    buttons: [btn('cancel', `cancel_trip_${tripId}`, lang)],
  };
}

export function driverArrived(lang: Lang, name: string): OutMessage {
  return { kind: 'text', body: t('driver_arrived', lang, { name }) };
}

export function tripStarted(lang: Lang): OutMessage {
  return { kind: 'text', body: t('trip_started', lang) };
}

export function completionConfirm(lang: Lang, name: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('done_confirm', lang, { name }),
    // Positive action last: in a chat people tend to tap the bottom button,
    // so Yes belongs under No rather than above it.
    buttons: [btn('no', 'confirm_no', lang), btn('yes', 'confirm_yes', lang)],
  };
}

/**
 * Optional ask for the drop location when a typed destination left us without
 * coordinates. Skippable, and a location screen cannot share a message with
 * reply buttons, so tapping Share sends the picker as a second message.
 */
export function dropProof(lang: Lang, kind: 'completed' | 'disputed'): OutMessage {
  return {
    kind: 'buttons',
    body: t(kind === 'disputed' ? 'drop_proof_disputed' : 'drop_proof_completed', lang),
    buttons: [
      btn('share_location', 'drop_proof_share', lang),
      btn('skip', 'drop_proof_skip', lang),
    ],
  };
}

export function dropProofShare(lang: Lang): OutMessage {
  return { kind: 'location_request', body: t('drop_proof_share_hint', lang) };
}

export function fareCheck(lang: Lang, name: string, amountPaise: Paise): OutMessage {
  return {
    kind: 'buttons',
    body: t('fare_check', lang, { name, amount: formatRupees(amountPaise) }),
    buttons: [
      btn('yes', 'fare_yes', lang),
      btn('fare_more', 'fare_more', lang),
      btn('fare_less', 'fare_less', lang),
    ],
  };
}

export function disputed(lang: Lang, phone: string): OutMessage {
  return { kind: 'text', body: t('disputed', lang, { phone }) };
}

export function disputeResolved(lang: Lang): OutMessage {
  return { kind: 'text', body: t('dispute_resolved', lang) };
}

/** Answer to "help". Always replies - a helpline that stays silent is worse
 *  than none, so with no number configured it falls back to the chat itself. */
export function helpReply(lang: Lang, phone: string | null): OutMessage {
  return phone
    ? { kind: 'text', body: t('help_reply', lang, { phone }) }
    : { kind: 'text', body: t('help_no_number', lang) };
}

export function rateList(lang: Lang, name: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('rate_prompt', lang, { name }),
    buttons: [
      { id: 'rate_1', title: '★1' },
      { id: 'rate_3', title: '★3' },
      { id: 'rate_5', title: '★5' },
    ],
  };
}

export function thanksForRating(lang: Lang): OutMessage {
  return { kind: 'text', body: t('thanks_rating', lang) };
}

export function tripCancelled(lang: Lang): OutMessage {
  return { kind: 'text', body: t('cancelled', lang) };
}

/** Predefined reasons; the last row asks for a typed reason instead. */
export function cancelReasonList(lang: Lang, kind: 'rider' | 'driver'): OutMessage {
  const rows =
    kind === 'rider'
      ? [
          ['reason_got_another_auto', 'creason_got_another_auto'],
          ['reason_changed_mind', 'creason_changed_mind'],
          ['reason_long_wait', 'creason_long_wait'],
          ['reason_mistake', 'creason_mistake'],
        ]
      : [
          ['reason_unreachable', 'creason_unreachable'],
          ['reason_too_far', 'creason_too_far'],
          ['reason_vehicle_problem', 'creason_vehicle_problem'],
          ['reason_not_available', 'creason_not_available'],
        ];
  return {
    kind: 'list',
    body: t('cancel_reason_prompt', lang),
    button: t('cancel_reason_title', lang),
    sections: [
      {
        title: t('cancel_reason_title', lang),
        rows: [
          ...rows.map(([key, id]) => ({ id, title: t(key, lang) })),
          { id: 'creason_other', title: t('reason_other', lang) },
        ],
      },
    ],
  };
}

export function cancelReasonTyped(lang: Lang): OutMessage {
  return { kind: 'text', body: t('cancel_reason_typed_prompt', lang) };
}

export function driverDroppedOut(lang: Lang, retryTripId: string | null): OutMessage {
  if (!retryTripId) return { kind: 'text', body: t('driver_dropped_out', lang) };
  return {
    kind: 'buttons',
    body: t('driver_dropped_out_retry', lang),
    buttons: [btn('try_again', `retry_${retryTripId}`, lang)],
  };
}

export function cancelConfirm(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('cancel_confirm', lang),
    buttons: [btn('yes', 'cancel_yes', lang), btn('no', 'cancel_no', lang)],
  };
}

// ─────────────────────────── Driver ───────────────────────────

export function askDriverName(lang: Lang): OutMessage {
  return { kind: 'text', body: t('ask_driver_name', lang) };
}

export function askVehicle(lang: Lang): OutMessage {
  return { kind: 'text', body: t('ask_vehicle', lang) };
}

export function askBaseLocation(lang: Lang): OutMessage {
  return {
    kind: 'location_request',
    body: `${t('ask_base_location', lang)}\n\n${t('location_hint_select', lang)}`,
  };
}

/** Re-prompt when a base location arrives as text. Matching needs coordinates. */
export function needBaseLocation(lang: Lang): OutMessage {
  return { kind: 'location_request', body: t('need_base_location', lang) };
}

export function askRadius(lang: Lang, options: number[]): OutMessage {
  return {
    kind: 'buttons',
    body: t('ask_radius', lang),
    buttons: options.slice(0, 3).map((n) => ({
      id: `radius_${n}`,
      title: t('radius_km', lang, { n }),
    })),
  };
}

export function kycPrompt(lang: Lang, step: 'front' | 'back' | 'selfie'): OutMessage {
  const key = step === 'front' ? 'kyc_front' : step === 'back' ? 'kyc_back' : 'kyc_selfie';
  return {
    kind: 'buttons',
    body: t(key, lang),
    buttons: [btn('skip', 'skip_kyc', lang)],
  };
}

export function kycReceived(lang: Lang): OutMessage {
  return { kind: 'text', body: t('kyc_received', lang) };
}

export function kycSubmitted(lang: Lang): OutMessage {
  return { kind: 'text', body: t('kyc_submitted', lang) };
}

/** Sent by the office when they approve a driver's KYC. */
export function kycVerified(lang: Lang): OutMessage {
  return { kind: 'text', body: t('kyc_verified', lang) };
}

export function kycRejected(lang: Lang, phone: string): OutMessage {
  return { kind: 'text', body: t('kyc_rejected', lang, { phone }) };
}

/**
 * Closing message after any completed action. Tells a low-literacy user what
 * to do next instead of leaving them at a dead end.
 */
export function postComplete(lang: Lang): OutMessage {
  return { kind: 'text', body: t('post_complete', lang) };
}

export function pendingApproval(lang: Lang): OutMessage {
  return { kind: 'text', body: t('pending_approval', lang) };
}

export function needImage(lang: Lang): OutMessage {
  return { kind: 'text', body: t('kyc_need_image', lang) };
}

/** The upload failed on our side - say so rather than re-prompting. */
export function kycUploadFailed(lang: Lang): OutMessage {
  return { kind: 'text', body: t('kyc_upload_failed', lang) };
}

export function leadMessage(
  lang: Lang,
  tripId: string,
  from: string,
  nearText: string,
  to: string,
  distanceText: string,
  when: string,
): OutMessage {
  return {
    kind: 'buttons',
    body: `${t('lead', lang, { from, near: nearText, to, distance: distanceText ? t('lead_distance', lang, { distance: distanceText }) : '', when })}\n${t('quote_hint', lang)}`,
    buttons: [btn('quote_btn', `quote_${tripId}`, lang)],
  };
}

export function quoteSent(lang: Lang, amountPaise: Paise): OutMessage {
  return { kind: 'text', body: t('quote_sent', lang, { amount: formatRupees(amountPaise) }) };
}

export function quoteInvalid(lang: Lang): OutMessage {
  return { kind: 'text', body: t('quote_invalid', lang) };
}

export function alreadyQuoted(lang: Lang, amountPaise: Paise): OutMessage {
  return { kind: 'text', body: t('already_quoted', lang, { amount: formatRupees(amountPaise) }) };
}

export function tripTaken(lang: Lang): OutMessage {
  return { kind: 'text', body: t('trip_taken', lang) };
}

/** Distinct from "taken": nobody took it, the rider's window just closed. */
export function tripExpired(lang: Lang): OutMessage {
  return { kind: 'text', body: t('trip_expired', lang) };
}

/** Deep link straight into turn-by-turn navigation. */
export function navigateTo(lang: Lang, kind: 'pickup' | 'drop', lat: number, lng: number): OutMessage {
  return {
    kind: 'cta_url',
    body: t(kind === 'pickup' ? 'navigate_pickup' : 'navigate_drop', lang),
    button: t('navigate', lang),
    url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  };
}

export function quotePrompt(lang: Lang): OutMessage {
  return { kind: 'text', body: t('quote_prompt', lang) };
}

export function youGotTrip(
  lang: Lang,
  amountPaise: Paise,
  rider: string,
  phone: string,
  pickup: string,
  tripId: string,
): OutMessage {
  return {
    kind: 'buttons',
    body: t('you_got_trip', lang, {
      amount: formatRupees(amountPaise),
      rider,
      phone,
      pickup,
    }),
    footer: t('start_hint', lang),
    buttons: [
      btn('start_btn', 'start_trip', lang),
      btn('cancel', `cancel_trip_${tripId}`, lang),
    ],
  };
}

/**
 * After a driver wins a ride, his other pending quotes were withdrawn (he can
 * only be on one ride). Said plainly so the vanished rides are not a mystery.
 */
export function otherQuotesWithdrawn(lang: Lang): OutMessage {
  return { kind: 'text', body: t('other_quotes_withdrawn', lang) };
}

export function askStart(lang: Lang, tripId: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('ask_start', lang),
    buttons: [
      btn('start_btn', 'start_trip', lang),
      btn('cancel', `cancel_trip_${tripId}`, lang),
    ],
  };
}

export function askArrived(lang: Lang, tripId: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('ask_arrived', lang),
    buttons: [
      btn('arrived_btn', 'arrived', lang),
      btn('cancel', `cancel_trip_${tripId}`, lang),
    ],
  };
}

export function riderEnRoute(lang: Lang, name: string, vehicle: string): OutMessage {
  return { kind: 'text', body: t('rider_en_route', lang, { name, vehicle }) };
}

export function askOtp(lang: Lang): OutMessage {
  return { kind: 'text', body: t('ask_otp', lang) };
}

/** Carries the DONE button: the driver must be able to end the trip
 *  without knowing to type DONE. */
export function otpOk(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('otp_ok', lang),
    buttons: [btn('trip_done', 'trip_done', lang)],
  };
}

export function otpWrong(lang: Lang): OutMessage {
  return { kind: 'text', body: t('otp_wrong', lang) };
}

export function otpBlocked(lang: Lang, phone: string): OutMessage {
  return { kind: 'text', body: t('otp_blocked', lang, { phone }) };
}

export function askDone(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('ask_done', lang),
    buttons: [btn('trip_done', 'trip_done', lang)],
  };
}

export function rateRider(lang: Lang, rider: string): OutMessage {
  return {
    kind: 'buttons',
    body: t('rate_rider', lang, { rider }),
    buttons: [
      { id: 'rate_1', title: '★1' },
      { id: 'rate_3', title: '★3' },
      { id: 'rate_5', title: '★5' },
    ],
  };
}

export function driverCancelled(lang: Lang): OutMessage {
  return { kind: 'text', body: t('driver_cancelled', lang) };
}

export function subscriptionLapsed(lang: Lang, pricePaise: Paise, contact: string): OutMessage {
  return {
    kind: 'text',
    body: t('sub_lapsed', lang, { price: formatRupees(pricePaise), contact }),
  };
}

export function updateBase(lang: Lang): OutMessage {
  return {
    kind: 'buttons',
    body: t('update_base', lang),
    buttons: [btn('yes', 'base_yes', lang), btn('no', 'base_no', lang)],
  };
}

export function baseUpdated(lang: Lang): OutMessage {
  return { kind: 'text', body: t('base_updated', lang) };
}

export function driverHelp(lang: Lang): OutMessage {
  return { kind: 'text', body: t('driver_help', lang) };
}

/** A driver at rest: the same menu idea as the rider, with a way to see open trips. */
export function driverMenu(lang: Lang, openTrips: number): OutMessage {
  const buttons: Button[] = [];
  if (openTrips > 0) buttons.push(btn('see_trips', 'see_trips', lang));
  buttons.push(btn('menu_help', 'help', lang), btn('menu_language', 'language', lang));
  return {
    kind: 'buttons',
    body:
      openTrips > 0
        ? t('driver_menu_open', lang, { n: openTrips })
        : t('driver_menu_none', lang),
    buttons,
  };
}
