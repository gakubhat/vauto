/**
 * Kannada-first copy. English provided for riders and drivers who switch.
 *
 * NOTE: Kannada strings need review by a native speaker before launch.
 */

export type Lang = 'kannada' | 'english';

type Entry = { en: string; kn: string };

const T: Record<string, Entry> = {
  // Shared
  welcome: { en: 'Welcome to VAuto!', kn: 'ವಿಆಟೋಗೆ ಸ್ವಾಗತ!' },
  role_prompt: {
    en: 'Welcome! Are you here to book an auto, or are you an auto driver?',
    kn: 'ನಮಸ್ಕಾರ! ನೀವು ಆಟೋ ಬುಕ್ ಮಾಡಲು ಬಂದಿದ್ದೀರಾ ಅಥವಾ ನೀವು ಆಟೋ ಚಾಲಕರಾ?',
  },
  role_rider: { en: 'Book an auto', kn: 'ಆಟೋ ಬುಕ್ ಮಾಡಿ' },
  role_driver: { en: 'I am a driver', kn: 'ನಾನು ಚಾಲಕ' },
  skip: { en: 'Skip', kn: 'ಬಿಡಿ' },
  yes: { en: 'Yes', kn: 'ಹೌದು' },
  no: { en: 'No', kn: 'ಇಲ್ಲ' },
  cancel: { en: 'Cancel', kn: 'ರದ್ದುಗೊಳಿಸಿ' },
  // Pickup and a driver's base must be a real location: matching runs on
  // coordinates. No "or type it" here - that is what left riders and drivers
  // invisible to each other.
  location_hint_select: {
    en: 'Tap the button below to share your location.',
    kn: 'ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ನಿಮ್ಮ ಲೊಕೇಶನ್ ಹಂಚಿಕೊಳ್ಳಿ.',
  },
  // The re-prompt after a typed pickup. Deliberately different from the first
  // prompt: an identical re-send looks like the bot did not hear them.
  need_location: {
    en: "Your auto needs your exact spot so a nearby driver can find you. Tap the button below to share it - typing the area name won't work here.",
    kn: 'ನಿಮ್ಮ ಆಟೋ ಸಿಗಲು ನಿಮ್ಮ ನಿಖರವಾದ ಸ್ಥಳ ಬೇಕು. ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ಅದನ್ನು ಹಂಚಿಕೊಳ್ಳಿ - ಸ್ಥಳದ ಹೆಸರು ಟೈಪ್ ಮಾಡಿದರೆ ಆಗುವುದಿಲ್ಲ.',
  },
  pickup_options: {
    en: 'Stuck? You can cancel this booking.',
    kn: 'ಸಮಸ್ಯೆಯೇ? ಈ ಬುಕಿಂಗ್ ಅನ್ನು ರದ್ದುಮಾಡಬಹುದು.',
  },
  need_base_location: {
    en: 'Please tap the button below and select where you wait.',
    kn: 'ದಯವಿಟ್ಟು ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ನೀವು ಕಾಯುವ ಲೊಕೇಶನ್ ಆಯ್ಕೆ ಮಾಡಿ.',
  },
  // Drop may be typed: drivers read the description and quote from local
  // knowledge, and an approximate destination is better than none.
  location_hint_type: {
    en: 'Tap the button below, or just type the area name.',
    kn: 'ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ, ಅಥವಾ ಸ್ಥಳದ ಹೆಸರು ಬರೆಯಿರಿ.',
  },
  language_menu: { en: 'Choose your language', kn: 'ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆ ಮಾಡಿ' },
  language_set: { en: 'Language set.', kn: 'ಭಾಷೆ ಆಯ್ಕೆಯಾಗಿದೆ.' },

  // Rider signup
  ask_name: { en: "What's your name?", kn: 'ನಿಮ್ಮ ಹೆಸರು ಏನು?' },
  rider_ready: {
    en: 'You are all set! Tap below to book an auto whenever you need one.',
    kn: 'ಎಲ್ಲ ಸಿದ್ಧವಾಗಿದೆ! ಆಟೋ ಬೇಕಾದಾಗ ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ.',
  },
  book_auto: { en: 'Book an auto', kn: 'ಆಟೋ ಬುಕ್ ಮಾಡಿ' },
  rider_menu: { en: 'What would you like to do?', kn: 'ನೀವು ಏನು ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?' },
  menu_help: { en: 'Help', kn: 'ಸಹಾಯ' },
  menu_language: { en: 'Language', kn: 'ಭಾಷೆ' },

  // Rider booking
  ask_pickup: {
    en: 'Where should the auto come?',
    kn: 'ಆಟೋ ಎಲ್ಲಿಗೆ ಬರಬೇಕು?',
  },
  ask_drop: {
    en: 'Where are you going?',
    kn: 'ನೀವು ಎಲ್ಲಿಗೆ ಹೋಗುತ್ತೀದ್ದೀರಾ?',
  },
  drop_options: {
    en: "Can't pick it on the map? Type the area name instead.",
    kn: 'ನಕ್ಷೆಯಲ್ಲಿ ಆಯ್ಕೆ ಮಾಡಲು ಆಗುತ್ತಿಲ್ಲವೇ? ಸ್ಥಳದ ಹೆಸರು ಟೈಪ್ ಮಾಡಿ.',
  },
  type_drop: { en: 'Type the destination', kn: 'ಗಮ್ಯಸ್ಥಾನ ಟೈಪ್ ಮಾಡಿ' },
  ask_drop_typed: {
    en: 'Type the area name, e.g. Bus stand.',
    kn: 'ಸ್ಥಳದ ಹೆಸರು ಟೈಪ್ ಮಾಡಿ, ಉದಾ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್.',
  },
  confirm_card: {
    en: '*From*\n{pickup}\n\n*To*\n{drop}{distance}',
    kn: '*ಇಂದ*\n{pickup}\n\n*ಗೆ*\n{drop}{distance}',
  },
  confirm_distance: { en: '\n\n_About {distance}_', kn: '\n\n_ಸುಮಾರು {distance}_' },
  book_now: { en: 'Book now', kn: 'ಈಗಲೇ ಬುಕ್ ಮಾಡಿ' },
  cancel_booking: { en: 'Cancel booking', kn: 'ಬುಕಿಂಗ್ ರದ್ದುಮಾಡಿ' },
  schedule: { en: 'Schedule', kn: 'ಮುಂಗಡವಾಗಿ ಬುಕ್ ಮಾಡಿ' },
  change_pickup: { en: 'Change pickup', kn: 'ಪಿಕಪ್ ಬದಲಿಸಿ' },
  change_drop: { en: 'Change drop', kn: 'ಗಮ್ಯ ಬದಲಿಸಿ' },
  schedule_slot: { en: 'When should the auto come?', kn: 'ಆಟೋ ಯಾವಾಗ ಬರಬೇಕು?' },
  choose_time: { en: 'Choose time', kn: 'ಸಮಯ ಆಯ್ಕೆಮಾಡಿ' },
  today: { en: 'today', kn: 'ಇಂದು' },
  tomorrow: { en: 'tomorrow', kn: 'ನಾಳೆ' },
  schedule_hour: { en: 'What time?', kn: 'ಯಾವ ಸಮಯ?' },
  schedule_overnight_note: {
    en: "Early-morning pickup. We'll offer this to drivers tonight — a driver isn't guaranteed, so please keep a backup. We'll tell you if nobody takes it.",
    kn: 'ಮುಂಜಾನೆ ಪ್ರಯಾಣ. ಇಂದು ರಾತ್ರಿಯೇ ಚಾಲಕರಿಗೆ ತಿಳಿಸುತ್ತೇವೆ — ಚಾಲಕ ಸಿಗುವುದು ಖಚಿತವಲ್ಲ, ದಯವಿಟ್ಟು ಪರ್ಯಾಯ ವ್ಯವಸ್ಥೆ ಇಟ್ಟುಕೊಳ್ಳಿ. ಯಾರೂ ತೆಗೆದುಕೊಳ್ಳದಿದ್ದರೆ ನಾವು ತಿಳಿಸುತ್ತೇವೆ.',
  },
  schedule_at_risk: {
    en: 'No driver has taken your {time} pickup yet. Please arrange another way to get there, or call us: {phone}.',
    kn: 'ನಿಮ್ಮ {time} ಪ್ರಯಾಣವನ್ನು ಇನ್ನೂ ಯಾವ ಚಾಲಕರೂ ತೆಗೆದುಕೊಂಡಿಲ್ಲ. ದಯವಿಟ್ಟು ಬೇರೆ ವ್ಯವಸ್ಥೆ ಮಾಡಿಕೊಳ್ಳಿ, ಅಥವಾ ನಮಗೆ ಕರೆ ಮಾಡಿ: {phone}.',
  },
  unknown_place: { en: 'Somewhere nearby', kn: 'ಹತ್ತಿರದಲ್ಲಿ ಎಲ್ಲೋ' },

  // Quotes
  finding_auto: {
    en: 'Finding an auto. We will message you as drivers quote.',
    kn: 'ಆಟೋ ಹುಡುಕಲಾಗುತ್ತಿದೆ. ಚಾಲಕರು ಬೆಲೆ ಹೇಳಿದಾಗ ನಿಮಗೆ ಸಂದೇಶ ಬರುತ್ತದೆ.',
  },
  finding_auto_told: {
    en: 'We told {count} autos nearby. As they quote, you will see their prices here.',
    kn: 'ಹತ್ತಿರದ {count} ಆಟೋಗಳಿಗೆ ಹೇಳಿದ್ದೇವೆ. ಬೆಲೆ ಹೇಳಿದಂತೆ ನಿಮಗೆ ಇಲ್ಲಿ ತಿಳಿಯುತ್ತದೆ.',
  },
  finding_auto_told_one: {
    en: 'We told 1 auto nearby. As it quotes, you will see the price here.',
    kn: 'ಹತ್ತಿರದ 1 ಆಟೋಗೆ ಹೇಳಿದ್ದೇವೆ. ಬೆಲೆ ಹೇಳಿದಂತೆ ನಿಮಗೆ ಇಲ್ಲಿ ತಿಳಿಯುತ್ತದೆ.',
  },
  no_cover: {
    en: 'No autos cover this area right now. Try again in a little while.',
    kn: 'ಈ ಪ್ರದೇಶದಲ್ಲಿ ಈಗ ಯಾವ ಆಟೋವೂ ಇಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
  quote_list_body: {
    en: '{count} autos quoted. Open the list and pick one.',
    kn: '{count} ಆಟೋದವರು ಬೆಲೆ ತಿಳಿಸಿದ್ದಾರೆ. ಪಟ್ಟಿಯಿಂದ ಒಂದನ್ನು ಆರಿಸಿ.',
  },
  quote_list_body_one: {
    en: '1 auto quoted. Open the list and pick one.',
    kn: '1 ಆಟೋ ಬೆಲೆ ಹೇಳಿದೆ. ಪಟ್ಟಿ ತೆರೆದು ಒಂದನ್ನು ಆರಿಸಿ.',
  },
  quote_list_closed: {
    en: 'Time to pick. Open the list and choose an auto.',
    kn: 'ಈಗ ಆರಿಸಿ. ಪಟ್ಟಿ ತೆರೆದು ಆಟೋ ಆಯ್ಕೆ ಮಾಡಿ.',
  },
  pick_auto: { en: 'Pick an auto', kn: 'ಒಂದು ಆಟೋ ಆರಿಸಿ' },
  quote_list_title: { en: 'Quotes', kn: 'ಬೆಲೆಗಳು' },
  // How a rating reads in the pick list; `{rating}` is the number. Swap this
  // for "Rating {rating}" if the star does not render on a target device.
  quote_rating: { en: '★{rating}', kn: '★{rating}' },
  // Shown where a rating would be, for a driver with none yet.
  new_driver: { en: 'New driver', kn: 'ಹೊಸ ಚಾಲಕ' },
  no_quotes: {
    en: 'No autos responded this time.',
    kn: 'ಈ ಬಾರಿ ಯಾವ ಆಟೋವೂ ಉತ್ತರಿಸಲಿಲ್ಲ.',
  },
  pick_timeout: {
    en: "We didn't hear back in time, so this trip was closed. Tap below to try again.",
    kn: 'ಸಮಯಕ್ಕೆ ಉತ್ತರ ಬರಲಿಲ್ಲ, ಹಾಗಾಗಿ ಈ ಪ್ರಯಾಣ ಮುಚ್ಚಲಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಲು ಕೆಳಗೆ ಒತ್ತಿ.',
  },
  try_again: { en: 'Try again', kn: 'ಪುನಃ ಪ್ರಯತ್ನಿಸಿ' },
  change_details: { en: 'Change details', kn: 'ವಿವರ ಬದಲಿಸಿ' },

  // Trip
  assigned_rider: {
    en: '*{name}* is on the way\nAuto *{vehicle}*\n\n*Call* {phone}\n\nGive this code when the auto arrives\n*Code: {code}*',
    kn: '*{name}* ಬರುತ್ತಿದ್ದಾರೆ\nಆಟೋ *{vehicle}*\n\n*ಕರೆ* {phone}\n\nಆಟೋ ಬಂದಾಗ ಈ ಕೋಡ್ ಹೇಳಿ\n*ಕೋಡ್: {code}*',
  },
  driver_arrived: { en: '{name} has arrived.', kn: '{name} ಬಂದಿದ್ದಾರೆ.' },
  trip_started: { en: 'Trip started. Have a safe ride.', kn: 'ಪ್ರಯಾಣ ಆರಂಭವಾಗಿದೆ.' },
  done_confirm: { en: 'Did {name} drop you at your destination?', kn: '{name} ನಿಮ್ಮನ್ನು ಗಮ್ಯಸ್ಥಾನಕ್ಕೆ ತಲುಪಿಸಿದ್ದಾರಾ?' },
  fare_check: {
    en: '{name} quoted {amount}. Did you pay about that?',
    kn: '{name} {amount} ಹೇಳಿದ್ದರು. ನೀವು ಅಷ್ಟೇ ಕೊಟ್ಟಿರಾ?',
  },
  fare_more: { en: 'Paid more', kn: 'ಹೆಚ್ಚು ಕೊಟ್ಟೆ' },
  fare_less: { en: 'Paid less', kn: 'ಕಡಿಮೆ ಕೊಟ್ಟೆ' },
  disputed: {
    en: 'Marked as disputed. Our office will call you. To reach us now, call: {phone}',
    kn: 'ವಿವಾದಿತ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ. ನಮ್ಮ ಕಛೇರಿಯಿಂದ ಕರೆ ಬರುತ್ತದೆ. ಈಗಲೇ ಸಂಪರ್ಕಿಸಲು ಕರೆ ಮಾಡಿ: {phone}',
  },
  dispute_resolved: {
    en: 'Our office has reviewed your trip and closed it. You can book again whenever you like. Thanks for your patience.',
    kn: 'ನಮ್ಮ ಕಛೇರಿ ನಿಮ್ಮ ಪ್ರಯಾಣವನ್ನು ಪರಿಶೀಲಿಸಿ ಮುಚ್ಚಿದೆ. ನೀವು ಯಾವಾಗ ಬೇಕಾದರೂ ಮತ್ತೆ ಬುಕ್ ಮಾಡಬಹುದು. ತಾಳ್ಮೆಗೆ ಧನ್ಯವಾದ.',
  },
  // Optional, after the ride: fills in the drop coordinates a typed
  // destination left out. Never blocks the trip.
  drop_proof_completed: {
    en: 'If you can, share where you were dropped. It helps us improve.',
    kn: 'ಸಾಧ್ಯವಾದರೆ ನೀವು ಇಳಿದ ಲೊಕೇಶನ್ ಹಂಚಿಕೊಳ್ಳಿ. ಇದು ನಮ್ಮ ಸೇವೆಯ ಸುಧಾರಣೆಗೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ.',
  },
  drop_proof_disputed: {
    en: 'Share your location so our office can look into this.',
    kn: 'ನಮ್ಮ ಕಛೇರಿಯಿಂದ ಪರಿಶೀಲಿಸಲು ನಿಮ್ಮ ಲೊಕೇಶನ್ ಹಂಚಿಕೊಳ್ಳಿ.',
  },
  drop_proof_share_hint: {
    en: 'Tap the button below to share your location.',
    kn: 'ನಿಮ್ಮ ಲೊಕೇಶನ್ ಹಂಚಿಲೊಳ್ಳಲು ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ.',
  },
  share_location: { en: 'Share location', kn: 'ಲೊಕೇಶನ್ ಹಂಚಿ' },
  rate_prompt: { en: 'Rate {name} - how was the ride?', kn: 'ಪ್ರಯಾಣದ ಅನುಭವದ ಕುರಿತು {name} ಗೆ ರೇಟಿಂಗ್ ಕೊಡಿ' },
  thanks_rating: { en: 'Thanks for the rating!', kn: 'ರೇಟಿಂಗ್‌ಗೆ ಧನ್ಯವಾದ!' },
  cancelled: { en: 'Trip cancelled.', kn: 'ಪ್ರಯಾಣ ರದ್ದಾಗಿದೆ.' },
  cancel_confirm: { en: 'Cancel this trip?', kn: 'ಈ ಪ್ರಯಾಣ ರದ್ದು ಮಾಡುವುದೇ?' },
  cannot_cancel: {
    en: 'The trip has already started, so it cannot be cancelled.',
    kn: 'ಪ್ರಯಾಣ ಆರಂಭವಾಗಿದೆ, ರದ್ದು ಮಾಡಲು ಆಗುವುದಿಲ್ಲ.',
  },
  trip_status: {
    en: 'Your trip is {status}. {name} - {vehicle}. Call: {phone}',
    kn: 'ನಿಮ್ಮ ಪ್ರಯಾಣ {status}. {name} - {vehicle}. ಕರೆ ಮಾಡಿ: {phone}',
  },
  trip_status_open: { en: 'being booked', kn: 'ಬುಕ್ ಆಗುತ್ತಿದೆ' },
  trip_status_assigned: { en: 'assigned to a driver', kn: 'ಚಾಲಕರಿಗೆ ನಿಗದಿಯಾಗಿದೆ' },
  trip_status_arrived: { en: 'waiting for your pickup code', kn: 'ನಿಮ್ಮ ಕೋಡ್-ಗಾಗಿ ಕಾಯುತ್ತಿದೆ' },
  trip_status_in_progress: { en: 'in progress', kn: 'ನಡೆಯುತ್ತಿದೆ' },
  trip_status_disputed: { en: 'disputed', kn: 'ವಿವಾದಿತ' },
  no_active_trip: { en: 'You have no active trip.', kn: 'ಯಾವುದೇ ಪ್ರಯಾಣ ಚಾಲ್ತಿಯಲ್ಲಿ ಇಲ್ಲ.' },
  help_reply: {
    en: 'Need help? Call us: {phone}. We are happy to help.',
    kn: 'ಸಹಾಯ ಬೇಕೇ? ನಮಗೆ ಕರೆ ಮಾಡಿ: {phone}. ನಾವು ಸಹಾಯ ಮಾಡುತ್ತೇವೆ.',
  },
  help_no_number: {
    en: 'Reply here with your problem and our office will help you.',
    kn: 'ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ತಿಳಿಸಿ, ನಮ್ಮ ಕಛೇರಿಯಿಂದ ಸಹಾಯ ನೀಡಲಾಗುತ್ತದೆ.',
  },

  // Driver signup
  ask_driver_name: { en: "What's your name?", kn: 'ನಿಮ್ಮ ಹೆಸರು ಏನು?' },
  ask_vehicle: { en: 'Your auto number? (e.g. KA-05-MB-1234)', kn: 'ನಿಮ್ಮ ಆಟೋ ನಂಬರ್? (ಉದಾ. KA-05-MB-1234)' },
  ask_base_location: {
    en: 'Where do you usually wait for trips?',
    kn: 'ನೀವು ಸಾಮಾನ್ಯವಾಗಿ ಪ್ರಯಾಣಿಕರಿಗಾಗಿ ಎಲ್ಲಿ ಕಾಯುತ್ತೀರಿ?',
  },
  ask_radius: { en: 'How far will you go for a trip?', kn: 'ಪ್ರಯಾಣಕ್ಕೆ ಎಷ್ಟು ದೂರ ಹೋಗಲು ತಯಾರಿದ್ದೀರಾ?' },
  radius_km: { en: '{n} km', kn: '{n} ಕಿ.ಮೀ' },
  kyc_front: { en: 'Send a photo of your Aadhaar (front).', kn: 'ನಿಮ್ಮ ಆಧಾರ್ ಫೋಟೋ ಕಳುಹಿಸಿ (ಮುಂಭಾಗ).' },
  kyc_back: { en: 'Now the back of your Aadhaar.', kn: 'ಈಗ ಆಧಾರ್‌ನ ಹಿಂಭಾಗ.' },
  kyc_selfie: { en: 'Now send a selfie.', kn: 'ಈಗ ನಿಮ್ಮ ಭಾವಚಿತ್ರ/ಸೆಲ್ಫಿ ಕಳುಹಿಸಿ.' },
  kyc_received: { en: 'Received.', kn: 'ತಲುಪಿದೆ.' },
  kyc_submitted: {
    en: 'Documents sent for review. We will message you once verified.',
    kn: 'ದಾಖಲೆಗಳು ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ. ಪರಿಶೀಲನೆಯಾದ ಮೇಲೆ ಸಂದೇಶ ಬರುತ್ತದೆ.',
  },
  pending_approval: {
    en: 'Your details are with us. Trips will start once you are verified.\n\nWe share leads among drivers near you, and riders pick based on your price, rating and how fast you reply - so quote promptly. We cannot promise every lead becomes a ride.',
    kn: 'ನಿಮ್ಮ ವಿವರಗಳು ನಮ್ಮಲ್ಲಿವೆ. ಪರಿಶೀಲನೆಯಾದ ಮೇಲೆ ಪ್ರಯಾಣಗಳು ಬರುತ್ತವೆ.\n\nನಿಮ್ಮ ಹತ್ತಿರದ ಚಾಲಕರ ನಡುವೆ ಲೀಡ್‌ಗಳನ್ನು ಹಂಚುತ್ತೇವೆ; ಪ್ರಯಾಣಿಕರು ನಿಮ್ಮ ಬೆಲೆ, ರೇಟಿಂಗ್ ಮತ್ತು ಎಷ್ಟು ಬೇಗ ಉತ್ತರಿಸುತ್ತೀರಿ ಎಂಬುದರ ಆಧಾರದ ಮೇಲೆ ಆಯ್ಕೆ ಮಾಡುತ್ತಾರೆ - ಆದ್ದರಿಂದ ಬೇಗ ಬೆಲೆ ಕಳುಹಿಸಿ. ಪ್ರತಿ ಲೀಡ್ ಪ್ರಯಾಣವಾಗುತ್ತದೆ ಎಂದು ಭರವಸೆ ನೀಡಲಾಗುವುದಿಲ್ಲ.',
  },
  kyc_need_image: { en: 'Please send a photo, or tap Skip.', kn: 'ದಯವಿಟ್ಟು ಫೋಟೋ ಕಳುಹಿಸಿ, ಅಥವಾ ಬಿಡಿ ಒತ್ತಿರಿ.' },
  kyc_upload_failed: {
    en: 'Sorry, that photo did not come through. Please send it again, or tap Skip.',
    kn: 'ಕ್ಷಮಿಸಿ, ಆ ಫೋಟೋ ಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ಇನ್ನೊಮ್ಮೆ ಕಳುಹಿಸಿ, ಅಥವಾ ಬಿಡಿ ಒತ್ತಿರಿ.',
  },
  kyc_verified: {
    en: 'Your documents are verified. Trips will now start coming to you.\n\nJoining is free, and using it is free for now. We will tell you well before that changes — you will never be charged without warning. Reply HELP at any time.',
    kn: 'ನಿಮ್ಮ ದಾಖಲೆಗಳು ಪರಿಶೀಲನೆಯಾಗಿವೆ. ಈಗ ನಿಮಗೆ ಪ್ರಯಾಣಗಳು ಬರುತ್ತವೆ.\n\nಸೇರುವುದು ಉಚಿತ, ಸದ್ಯ ಬಳಸುವುದೂ ಉಚಿತ. ಬದಲಾವಣೆ ಬಗ್ಗೆ ನಾವು ಮೊದಲೇ ತಿಳಿಸುತ್ತೇವೆ — ಮುನ್ಸೂಚನೆ ಇಲ್ಲದೆ ಎಂದೂ ಶುಲ್ಕ ವಿಧಿಸುವುದಿಲ್ಲ. ಯಾವಾಗ ಬೇಕಾದರೂ HELP ಎಂದು ಕಳುಹಿಸಿ.',
  },
  kyc_rejected: {
    en: 'Your documents were not approved. Please contact the office. Call us: {phone}',
    kn: 'ನಿಮ್ಮ ದಾಖಲೆಗಳು ಅನುಮೋದನೆ ಆಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಕಛೇರಿಗಯನ್ನು ಸಂಪರ್ಕಿಸಿ. ನಮಗೆ ಕರೆ ಮಾಡಿ: {phone}',
  },
  post_complete: {
    en: 'Thanks for using VAuto! Just say Hi when you need another auto. Or say Language / ಭಾಷೆ to switch.',
    kn: 'ವಿಆಟೋ ಬಳಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ! ಮತ್ತೆ ಆಟೋ ಬೇಕಾದಾಗ "ಹಾಯ್" ಅಥವಾ "Hi" ಎಂದು ಕಳುಹಿಸಿ. ಭಾಷೆ ಬದಲಾಯಿಸಲು "ಭಾಷೆ" ಎಂದು ಕಳುಹಿಸಿ.',
  },

  // Driver trips
  lead: {
    en: '*New trip*\n\n*From:* {from}\n_{near} away \n*To:* {to} (About {distance})\n*When:* {when}\n\n',
    kn: '*ಹೊಸ ಪ್ರಯಾಣ*\n\n*ಎಲ್ಲಿಂದ?:* {from}\n_{near} ದೂರದಲ್ಲಿ \n*ಎಲ್ಲಿಗೆ?:* {to} (ಸುಮಾರು {distance})\n*ಯಾವಾಗ?* {when}\n\n',
  },
  lead_distance: { en: '\n_{distance}_', kn: '\n_{distance}_' },
  lead_when_now: { en: 'Now', kn: 'ಈಗ' },
  navigate: { en: 'Navigate', kn: 'ದಾರಿ ತೋರಿಸಿ' },
  navigate_pickup: {
    en: 'Tap to navigate to the pickup.',
    kn: 'ಪಿಕಪ್ ಲೊಕೇಶನ್ ಗೆ  ದಾರಿ ತೋರಿಸಲು ಒತ್ತಿರಿ.',
  },
  navigate_drop: {
    en: 'Tap to navigate to the drop.',
    kn: 'ಡ್ರಾಪ್ ಲೊಕೇಶನ್ ಗೆ ದಾರಿ ತೋರಿಸಲು ಒತ್ತಿರಿ.',
  },
  quote_btn: { en: 'Quote', kn: 'ಬೆಲೆ ಹೇಳಿ' },
  quote_hint: { en: 'Click "Quote" or just reply with your price, like 70.', kn: '"ಬೆಲೆ ಹೇಳಿ" ಒತ್ತಿ ಅಥವಾ ನಿಮ್ಮ ಬೆಲೆಯನ್ನೇ ಕಳುಹಿಸಿ, ಉದಾ 70.' },
  quote_invalid: { en: 'Just send the amount in rupees, like 70.', kn: 'ರೂಪಾಯಿಯಲ್ಲಿ ಮೊತ್ತ ಕಳುಹಿಸಿ, ಉದಾ 70.' },
  quote_sent: { en: 'Your quote of {amount} was sent to the rider.', kn: 'ನಿಮ್ಮ {amount} ಬೆಲೆ ಪ್ರಯಾಣಿಕರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.' },
  already_quoted: {
    en: 'You already quoted {amount} for this trip.',
    kn: 'ಈ ಪ್ರಯಾಣಕ್ಕೆ ನೀವು ಈಗಾಗಲೇ {amount} ಹೇಳಿದ್ದೀರಿ.',
  },
  trip_taken: { en: 'That trip was already taken.', kn: 'ಆ ಪ್ರಯಾಣ ಈಗಾಗಲೇ ಮುಗಿದಿದೆ.' },
  driver_taken: {
    en: 'That auto just took another ride. Here are your other quotes.',
    kn: 'ಆ ಆಟೋ ಬೇರೆ ಪ್ರಯಾಣ ತೆಗೆದುಕೊಂಡಿತು. ನಿಮ್ಮ ಇತರ ಬೆಲೆಗಳು ಇಲ್ಲಿವೆ.',
  },
  trip_expired: {
    en: 'That trip is no longer available - the rider stopped waiting.',
    kn: 'ಆ ಪ್ರಯಾಣ ಈಗ ಲಭ್ಯವಿಲ್ಲ - ಪ್ರಯಾಣಿಕರು ಕಾಯುವುದನ್ನು ನಿಲ್ಲಿಸಿದರು.',
  },
  quote_prompt: {
    en: 'How much will you charge? Reply with the amount in rupees, like 70.',
    kn: 'ಎಷ್ಟು ಬಾಡಿಗೆ ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಿ? ರೂಪಾಯಿಯಲ್ಲಿ ಮೊತ್ತ ಕಳುಹಿಸಿ, ಉದಾ 70.',
  },
  you_got_trip: {
    en: '*You got the trip* - {amount}\n\n*Rider* {rider}\n*Call* {phone}\n\n*Pickup*\n{pickup}',
    kn: '*ಪ್ರಯಾಣ ಸಿಕ್ಕಿತು* - {amount}\n\n*ಪ್ರಯಾಣಿಕ* {rider}\n*ಕರೆ* {phone}\n\n*ಪಿಕಪ್*\n{pickup}',
  },
  other_quotes_withdrawn: {
    en: 'Your other quotes were withdrawn - you can only be on one ride at a time.',
    kn: 'ನಿಮ್ಮ ಇತರ ಬೆಲೆಗಳನ್ನು ಹಿಂಪಡೆಯಲಾಗಿದೆ - ಒಂದು ಸಮಯಕ್ಕೆ ಒಂದು ಪ್ರಯಾಣ ಮಾತ್ರ ಮಾಡಬಹುದು.',
  },
  start_btn: { en: 'I am on the way', kn: 'ಹೊರಟಿದ್ದೇನೆ' },
  start_hint: {
    en: 'Tap *I am on the way* when you start so the rider knows.',
    kn: 'ನೀವು ಹೊರಟಾಗ *ಹೊರಟಿದ್ದೇನೆ* ಒತ್ತಿ, ಪ್ರಯಾಣಿಕರಿಗೆ ತಿಳಿಯುತ್ತದೆ.',
  },
  ask_start: {
    en: 'Tap when you start towards the rider.',
    kn: 'ಹೊರಟಾಗ ಒತ್ತಿರಿ.',
  },
  ask_arrived: {
    en: 'Tap when you reach the pickup.',
    kn: 'ಪಿಕಪ್ ಸ್ಥಳ ತಲುಪಿದಾಗ ಒತ್ತಿರಿ.',
  },
  rider_en_route: {
    en: '*{name}* has started towards you.\nAuto *{vehicle}*',
    kn: '*{name}* ನಿಮ್ಮ ಕಡೆ ಹೊರಟಿದ್ದಾರೆ.\nಆಟೋ *{vehicle}*',
  },
  arrived_btn: { en: "I've arrived", kn: 'ನಾನು ಬಂದಿದ್ದೇನೆ' },
  ask_otp: { en: 'Ask the rider for the 4-digit code and send it.', kn: 'ಪ್ರಯಾಣಿಕರಿಂದ 4 ಅಂಕಿಯ ಕೋಡ್ ಕೇಳಿ ಕಳುಹಿಸಿ.' },
  otp_ok: { en: 'Trip started.', kn: 'ಪ್ರಯಾಣ ಆರಂಭವಾಗಿದೆ.' },
  otp_wrong: { en: 'Wrong code. Try again.', kn: 'ತಪ್ಪಾದ ಕೋಡ್. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' },
  otp_blocked: {
    en: 'Too many wrong codes. Please call the office. Call us: {phone}',
    kn: 'ತುಂಬಾ ತಪ್ಪಾದ ಕೋಡ್‌ಗಳು. ದಯವಿಟ್ಟು ಕಚೇರಿಗೆ ಕರೆ ಮಾಡಿ. ನಮಗೆ ಕರೆ ಮಾಡಿ: {phone}',
  },
  ask_done: { en: 'Send DONE when you drop the rider.', kn: 'ಪ್ರಯಾಣಿಕರನ್ನು ಬಿಟ್ಟ ಮೇಲೆ DONE ಕಳುಹಿಸಿ.' },
  rate_rider: { en: 'Rate {rider} - how was the trip?', kn: '{rider} ಗೆ ರೇಟಿಂಗ್ - ಪ್ರಯಾಣ ಹೇಗಿತ್ತು?' },
  cancel_reason_prompt: {
    en: 'Sorry about that. Why are you cancelling?',
    kn: 'ಕ್ಷಮಿಸಿ. ಏಕೆ ರದ್ದು ಮಾಡುತ್ತಿದ್ದೀರಿ?',
  },
  // WhatsApp caps a list section title at 24 chars and its open button at 20.
  cancel_reason_title: { en: 'Why?', kn: 'ಏಕೆ?' },
  trip_done: { en: 'Rider dropped', kn: 'ಪ್ರಯಾಣಿಕರನ್ನು ಬಿಟ್ಟೆ' },
  cancel_reason_typed_prompt: {
    en: 'Please type the reason in a few words.',
    kn: 'ದಯವಿಟ್ಟು ಕಾರಣವನ್ನು ಕೆಲವು ಪದಗಳಲ್ಲಿ ಬರೆಯಿರಿ.',
  },
  reason_other: { en: 'Other', kn: 'ಬೇರೆ ಕಾರಣ' },

  // Rider reasons
  reason_got_another_auto: { en: 'Got another auto', kn: 'ಬೇರೆ ಆಟೋ ಸಿಕ್ಕಿತು' },
  reason_changed_mind: { en: 'Changed my mind', kn: 'ಮನಸ್ಸು ಬದಲಾಯಿತು' },
  reason_long_wait: { en: 'Waiting too long', kn: 'ತುಂಬಾ ಹೊತ್ತಿನಿಂದ ಕಾಯುತ್ತಿದ್ದೇನೆ' },
  reason_mistake: { en: 'Booked by mistake', kn: 'ತಪ್ಪಾಗಿ ಬುಕ್ ಆಗಿದೆ' },

  // Driver reasons
  reason_unreachable: { en: 'Rider not answering', kn: 'ಪ್ರಯಾಣಿಕ ಉತ್ತರಿಸುತ್ತಿಲ್ಲ' },
  reason_too_far: { en: 'Too far', kn: 'ತುಂಬಾ ದೂರದಲ್ಲಿದೆ' },
  reason_vehicle_problem: { en: 'Vehicle problem', kn: 'ವಾಹನ ಸಮಸ್ಯೆ' },
  reason_not_available: { en: 'Not available now', kn: 'ಈಗ ಲಭ್ಯವಿಲ್ಲ' },

  rider_cancelled: {
    en: 'The rider cancelled this trip.',
    kn: 'ಪ್ರಯಾಣಿಕರು ಈ ಪ್ರಯಾಣ ರದ್ದು ಮಾಡಿದ್ದಾರೆ.',
  },
  driver_cancelled: { en: 'Trip cancelled. Cancelling too often affects your trips.', kn: 'ಪ್ರಯಾಣ ರದ್ದಾಗಿದೆ. ಆಗಾಗ ರದ್ದು ಮಾಡುವುದು ನಿಮ್ಮ ಪ್ರಯಾಣಗಳ ಮೇಲೆ ಪರಿಣಾಮ ಬೀರುತ್ತದೆ.' },
  driver_dropped_out: {
    en: 'The auto cancelled. We are finding another one for you.',
    kn: 'ಆಟೋ ರದ್ದಾಯಿತು. ನಿಮಗೆ ಇನ್ನೊಂದು ಹುಡುಕುತ್ತಿದ್ದೇವೆ.',
  },
  driver_dropped_out_retry: {
    en: 'The auto cancelled. Tap below to look again.',
    kn: 'ಆಟೋ ರದ್ದಾಯಿತು. ಮತ್ತೆ ಹುಡುಕಲು ಕೆಳಗೆ ಒತ್ತಿರಿ.',
  },
  sub_lapsed: {
    en: 'Your subscription has ended, so trips have paused. Pay {price} to start receiving them again - contact {contact}. Your autos and your prices stay exactly as you set them.',
    kn: 'ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆ ಮುಗಿದಿದೆ, ಹಾಗಾಗಿ ಪ್ರಯಾಣಗಳು ನಿಂತಿವೆ. ಮತ್ತೆ ಪಡೆಯಲು {price} ಪಾವತಿಸಿ - {contact} ಸಂಪರ್ಕಿಸಿ. ನಿಮ್ಮ ಆಟೋ ಮತ್ತು ನಿಮ್ಮ ಬೆಲೆಗಳು ಹಾಗೆಯೇ ಉಳಿಯುತ್ತವೆ.',
  },
  update_base: { en: 'Update where you wait to this location?', kn: 'ನೀವು ಕಾಯುವ ಸ್ಥಳವನ್ನು ಇಲ್ಲಿಗೆ ಬದಲಿಸುವುದೇ?' },
  base_updated: { en: 'Location updated.', kn: 'ಲೊಕೇಶನ್ ಬದಲಾಗಿದೆ.' },
  driver_help: {
    en: 'Reply with a number to quote. Send your location to update where you wait. Send "help" to call us.',
    kn: 'ಬೆಲೆ ಹೇಳಲು ಸಂಖ್ಯೆ ಕಳುಹಿಸಿ. ಕಾಯುವ ಸ್ಥಳ ಬದಲಿಸಲು ಲೊಕೇಶನ್ ಕಳುಹಿಸಿ. ನಮಗೆ ಕರೆ ಮಾಡಲು "ಸಹಾಯ" ಅಥವಾ "help" ಎಂದು ಕಳುಹಿಸಿ.',
  },
  /**
   * Menu bodies for a driver at rest. Distinct from `driver_help`, which is the
   * catch-all: that one leads with "reply with a number to quote", which is
   * unactionable when no trip is open.
   */
  driver_menu_none: {
    en: 'Namaskara! You are all set. No trips right now - we will message you the moment one comes up near you.',
    kn: 'ನಮಸ್ಕಾರ! ನೀವು ಸಿದ್ಧರಿದ್ದೀರಿ. ಈಗ ಯಾವುದೇ ಪ್ರಯಾಣ ಇಲ್ಲ - ನಿಮ್ಮ ಹತ್ತಿರ ಪ್ರಯಾಣ ಬಂದಾಗ ಇಲ್ಲಿ ಸಂದೇಶ ಕಳುಹಿಸುತ್ತೇವೆ.',
  },
  driver_menu_open: {
    en: 'You have {n} trip(s) open right now.',
    kn: 'ಈಗ {n} ಪ್ರಯಾಣ ಕಾಯುತ್ತಿದೆ.',
  },
  see_trips: { en: 'See trips', kn: 'ಪ್ರಯಾಣ ನೋಡಿ' },
};

export function t(key: string, lang: Lang, vars: Record<string, string | number> = {}): string {
  const entry = T[key] ?? T.greet ?? { en: key, kn: key };
  let s = lang === 'kannada' ? entry.kn : entry.en;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}

export function langOf(value: string | null | undefined): Lang {
  return value === 'english' ? 'english' : 'kannada';
}
