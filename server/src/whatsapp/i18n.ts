/**
 * Kannada-first copy. English provided for riders and drivers who switch.
 *
 * NOTE: Kannada strings need review by a native speaker before launch.
 */

export type Lang = 'kannada' | 'english';

type Entry = { en: string; kn: string };

const T: Record<string, Entry> = {
  // Shared
  welcome: { en: 'Welcome to VJobs!', kn: 'ವಿಜಾಬ್ಸ್‌ಗೆ ಸ್ವಾಗತ!' },
  role_prompt: {
    en: 'Welcome! Are you here to book an auto, or are you an auto driver?',
    kn: 'ನಮಸ್ಕಾರ! ನೀವು ಆಟೋ ಬುಕ್ ಮಾಡಲು ಬಂದಿದ್ದೀರಾ ಅಥವಾ ನೀವು ಆಟೋ ಚಾಲಕರಾ?',
  },
  role_rider: { en: 'Book an auto', kn: 'ಆಟೋ ಬುಕ್ ಮಾಡಿ' },
  role_driver: { en: 'I am a driver', kn: 'ನಾನು ಚಾಲಕ' },
  skip: { en: 'Skip', kn: 'ಬಿಡಿ' },
  yes: { en: 'Yes', kn: 'ಹೌದು' },
  no: { en: 'No', kn: 'ಇಲ್ಲ' },
  cancel: { en: 'Cancel', kn: 'ರದ್ದು' },
  send_location: { en: 'Send location', kn: 'ಸ್ಥಳ ಕಳುಹಿಸಿ' },
  location_hint: {
    en: 'Tap the button below to share it. If that does not work, just type the area name.',
    kn: 'ಕೆಳಗಿನ ಬಟನ್ ಒತ್ತಿ ಸ್ಥಳ ಹಂಚಿಕೊಳ್ಳಿ. ಆಗದಿದ್ದರೆ ಊರಿನ ಹೆಸರು ಬರೆಯಿರಿ.',
  },
  language_menu: { en: 'Choose your language', kn: 'ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆ ಮಾಡಿ' },
  language_set: { en: 'Language set.', kn: 'ಭಾಷೆ ಆಯ್ಕೆಯಾಗಿದೆ.' },

  // Rider signup
  ask_name: { en: "What's your name?", kn: 'ನಿಮ್ಮ ಹೆಸರು ಏನು?' },
  home_saved: { en: 'Home saved.', kn: 'ಮನೆಯ ವಿಳಾಸ ಉಳಿಸಲಾಗಿದೆ.' },
  rider_ready: {
    en: 'You are all set! Tap Book to order an auto, or just say hi anytime.',
    kn: 'ಎಲ್ಲ ಸಿದ್ಧ! ಆಟೋ ಬುಕ್ ಮಾಡಲು ಬುಕ್ ಒತ್ತಿ, ಅಥವಾ ಯಾವಾಗ ಬೇಕಾದರೂ ಹಾಯ್ ಹೇಳಿ.',
  },
  book_auto: { en: 'Book an auto', kn: 'ಆಟೋ ಬುಕ್ ಮಾಡಿ' },

  // Rider booking
  ask_pickup: {
    en: 'Where should the auto come? Send your location.',
    kn: 'ಆಟೋ ಎಲ್ಲಿಗೆ ಬರಬೇಕು? ನಿಮ್ಮ ಸ್ಥಳ ಕಳುಹಿಸಿ.',
  },
  ask_drop: {
    en: 'Where are you going? Send the destination location.',
    kn: 'ನೀವು ಎಲ್ಲಿಗೆ ಹೋಗುತ್ತೀರಿ? ಗಮ್ಯಸ್ಥಾನದ ಸ್ಥಳ ಕಳುಹಿಸಿ.',
  },
  confirm_card: {
    en: '*From*\n{pickup}\n\n*To*\n{drop}\n\n_About {distance}_',
    kn: '*ಇಂದ*\n{pickup}\n\n*ಗೆ*\n{drop}\n\n_ಸುಮಾರು {distance}_',
  },
  book_now: { en: 'Book now', kn: 'ಈಗ ಬುಕ್ ಮಾಡಿ' },
  schedule: { en: 'Schedule', kn: 'ಮುಂಚಿತವಾಗಿ' },
  change_pickup: { en: 'Change pickup', kn: 'ಪಿಕಪ್ ಬದಲಿಸಿ' },
  change_drop: { en: 'Change drop', kn: 'ಗಮ್ಯ ಬದಲಿಸಿ' },
  schedule_day: { en: 'Which day?', kn: 'ಯಾವ ದಿನ?' },
  today: { en: 'Today', kn: 'ಇಂದು' },
  tomorrow: { en: 'Tomorrow', kn: 'ನಾಳೆ' },
  schedule_hour: { en: 'What time?', kn: 'ಯಾವ ಸಮಯ?' },
  unknown_place: { en: 'Somewhere nearby', kn: 'ಹತ್ತಿರದಲ್ಲಿ ಎಲ್ಲೋ' },

  // Quotes
  finding_auto: {
    en: 'Finding an auto. We will message you as drivers quote.',
    kn: 'ಆಟೋ ಹುಡುಕಲಾಗುತ್ತಿದೆ. ಚಾಲಕರು ಬೆಲೆ ಹೇಳಿದಂತೆ ನಿಮಗೆ ಸಂದೇಶ ಬರುತ್ತದೆ.',
  },
  quote_msg: {
    en: '{name} ({vehicle}) - {amount}\nRating {rating}, {distance} km away',
    kn: '{name} ({vehicle}) - {amount}\nರೇಟಿಂಗ್ {rating}, {distance} ಕಿ.ಮೀ ದೂರ',
  },
  accept_quote: { en: 'Accept', kn: 'ಒಪ್ಪಿಕೊಳ್ಳಿ' },
  quote_status: {
    en: '{count} quotes so far, cheapest {amount}. Still looking.',
    kn: 'ಈಗ {count} ಬೆಲೆಗಳು, ಕಡಿಮೆ {amount}. ಇನ್ನೂ ಹುಡುಕಲಾಗುತ್ತಿದೆ.',
  },
  no_quotes: {
    en: 'No autos responded this time.',
    kn: 'ಈ ಬಾರಿ ಯಾವ ಆಟೋವೂ ಉತ್ತರಿಸಲಿಲ್ಲ.',
  },
  try_again: { en: 'Try again', kn: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' },
  change_details: { en: 'Change details', kn: 'ವಿವರ ಬದಲಿಸಿ' },

  // Trip
  assigned_rider: {
    en: '*{name}* is on the way\nAuto *{vehicle}*\n\n*Call* {phone}\n\nGive this code when the auto arrives\n*Code: {code}*',
    kn: '*{name}* ಬರುತ್ತಿದ್ದಾರೆ\nಆಟೋ *{vehicle}*\n\n*ಕರೆ* {phone}\n\nಆಟೋ ಬಂದಾಗ ಈ ಕೋಡ್ ಹೇಳಿ\n*ಕೋಡ್: {code}*',
  },
  driver_arrived: { en: '{name} has arrived.', kn: '{name} ಬಂದಿದ್ದಾರೆ.' },
  trip_started: { en: 'Trip started. Have a safe ride.', kn: 'ಪ್ರಯಾಣ ಆರಂಭ. ಸುರಕ್ಷಿತ ಪ್ರಯಾಣ.' },
  done_confirm: { en: 'Did {name} drop you at your destination?', kn: '{name} ನಿಮ್ಮನ್ನು ಗಮ್ಯಸ್ಥಾನಕ್ಕೆ ಬಿಟ್ಟರಾ?' },
  fare_check: {
    en: '{name} quoted {amount}. Did you pay about that?',
    kn: '{name} {amount} ಹೇಳಿದ್ದರು. ನೀವು ಅಷ್ಟು ಕೊಟ್ಟಿರಾ?',
  },
  fare_more: { en: 'Paid more', kn: 'ಹೆಚ್ಚು ಕೊಟ್ಟೆ' },
  fare_less: { en: 'Paid less', kn: 'ಕಡಿಮೆ ಕೊಟ್ಟೆ' },
  disputed: {
    en: 'Marked as disputed. Our office will call you.',
    kn: 'ವಿವಾದ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ. ನಮ್ಮ ಕಚೇರಿಯಿಂದ ಕರೆ ಬರುತ್ತದೆ.',
  },
  rate_prompt: { en: 'Rate {name} - how was the ride?', kn: '{name} ಗೆ ರೇಟಿಂಗ್ - ಪ್ರಯಾಣ ಹೇಗಿತ್ತು?' },
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
  no_active_trip: { en: 'You have no active trip.', kn: 'ನಿಮಗೆ ಚಾಲ್ತಿಯಲ್ಲಿರುವ ಪ್ರಯಾಣ ಇಲ್ಲ.' },
  rider_help: {
    en: 'Send "auto" to book, "status" to see your trip, or "language" to switch.',
    kn: '"ಆಟೋ" ಬುಕ್ ಮಾಡಲು, "ಸ್ಥಿತಿ" ಪ್ರಯಾಣ ನೋಡಲು, "ಭಾಷೆ" ಬದಲಿಸಲು ಕಳುಹಿಸಿ.',
  },

  // Driver signup
  ask_driver_name: { en: "What's your name?", kn: 'ನಿಮ್ಮ ಹೆಸರು ಏನು?' },
  ask_vehicle: { en: 'Your auto number? (e.g. KA-05-1234)', kn: 'ನಿಮ್ಮ ಆಟೋ ನಂಬರ್? (ಉದಾ. KA-05-1234)' },
  ask_base_location: {
    en: 'Send your location - where do you usually wait for trips?',
    kn: 'ನಿಮ್ಮ ಸ್ಥಳ ಕಳುಹಿಸಿ - ನೀವು ಸಾಮಾನ್ಯವಾಗಿ ಎಲ್ಲಿ ಕಾಯುತ್ತೀರಿ?',
  },
  ask_radius: { en: 'How far will you go for a trip?', kn: 'ಪ್ರಯಾಣಕ್ಕೆ ಎಷ್ಟು ದೂರ ಹೋಗುತ್ತೀರಿ?' },
  radius_km: { en: '{n} km', kn: '{n} ಕಿ.ಮೀ' },
  kyc_front: { en: 'Send a photo of your Aadhaar (front).', kn: 'ನಿಮ್ಮ ಆಧಾರ್ ಫೋಟೋ ಕಳುಹಿಸಿ (ಮುಂಭಾಗ).' },
  kyc_back: { en: 'Now the back of your Aadhaar.', kn: 'ಈಗ ಆಧಾರ್‌ನ ಹಿಂಭಾಗ.' },
  kyc_selfie: { en: 'Now send a selfie.', kn: 'ಈಗ ಸೆಲ್ಫಿ ಕಳುಹಿಸಿ.' },
  kyc_received: { en: 'Received.', kn: 'ಸಿಕ್ಕಿತು.' },
  kyc_submitted: {
    en: 'Documents sent for review. We will message you once verified.',
    kn: 'ದಾಖಲೆಗಳು ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ. ಪರಿಶೀಲನೆಯಾದ ಮೇಲೆ ಸಂದೇಶ ಬರುತ್ತದೆ.',
  },
  pending_approval: {
    en: 'Your details are with us. Trips will start once you are verified.',
    kn: 'ನಿಮ್ಮ ವಿವರಗಳು ನಮ್ಮಲ್ಲಿವೆ. ಪರಿಶೀಲನೆಯಾದ ಮೇಲೆ ಪ್ರಯಾಣಗಳು ಬರುತ್ತವೆ.',
  },
  kyc_need_image: { en: 'Please send a photo, or tap Skip.', kn: 'ದಯವಿಟ್ಟು ಫೋಟೋ ಕಳುಹಿಸಿ, ಅಥವಾ ಬಿಡಿ ಒತ್ತಿರಿ.' },
  kyc_verified: {
    en: 'Your documents are verified. Trips will now start coming to you.',
    kn: 'ನಿಮ್ಮ ದಾಖಲೆಗಳು ಪರಿಶೀಲನೆಯಾಗಿವೆ. ಈಗ ನಿಮಗೆ ಪ್ರಯಾಣಗಳು ಬರುತ್ತವೆ.',
  },
  kyc_rejected: {
    en: 'Your documents were not approved. Please contact the office.',
    kn: 'ನಿಮ್ಮ ದಾಖಲೆಗಳು ಅನುಮೋದನೆ ಆಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಕಚೇರಿಗೆ ಸಂಪರ್ಕಿಸಿ.',
  },
  post_complete: {
    en: 'Thanks for using VJobs! Just say Hi when you need another auto. Or say Language / ಭಾಷೆ to switch.',
    kn: 'ವಿಜಾಬ್ಸ್ ಬಳಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ! ಮತ್ತೆ ಆಟೋ ಬೇಕಾದಾಗ ಹಾಯ್ ಕಳುಹಿಸಿ. ಅಥವಾ ಭಾಷೆ ಎಂದು ಕಳುಹಿಸಿ.',
  },

  // Driver trips
  lead: {
    en: '*New trip*\n\n*From* {from}\n_{near} away_\n\n*To* {to}\n_{distance}_\n\n*When* {when}',
    kn: '*ಹೊಸ ಪ್ರಯಾಣ*\n\n*ಇಂದ* {from}\n_{near} ದೂರ_\n\n*ಗೆ* {to}\n_{distance}_\n\n*ಸಮಯ* {when}',
  },
  lead_when_now: { en: 'Now', kn: 'ಈಗ' },
  navigate: { en: 'Navigate', kn: 'ದಾರಿ ತೋರಿಸಿ' },
  navigate_pickup: {
    en: 'Tap to navigate to the pickup.',
    kn: 'ಪಿಕಪ್ ಸ್ಥಳಕ್ಕೆ ದಾರಿ ತೋರಿಸಲು ಒತ್ತಿರಿ.',
  },
  navigate_drop: {
    en: 'Tap to navigate to the drop.',
    kn: 'ಗಮ್ಯಸ್ಥಾನಕ್ಕೆ ದಾರಿ ತೋರಿಸಲು ಒತ್ತಿರಿ.',
  },
  quote_btn: { en: 'Quote', kn: 'ಬೆಲೆ ಹೇಳಿ' },
  quote_hint: { en: 'Or just reply with your price, like 70.', kn: 'ಅಥವಾ ನಿಮ್ಮ ಬೆಲೆಯನ್ನೇ ಕಳುಹಿಸಿ, ಉದಾ 70.' },
  quote_invalid: { en: 'Just send the amount in rupees, like 70.', kn: 'ರೂಪಾಯಿಯಲ್ಲಿ ಮೊತ್ತ ಕಳುಹಿಸಿ, ಉದಾ 70.' },
  quote_sent: { en: 'Your quote of {amount} was sent to the rider.', kn: 'ನಿಮ್ಮ {amount} ಬೆಲೆ ಪ್ರಯಾಣಿಕರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.' },
  already_quoted: {
    en: 'You already quoted {amount} for this trip.',
    kn: 'ಈ ಪ್ರಯಾಣಕ್ಕೆ ನೀವು ಈಗಾಗಲೇ {amount} ಹೇಳಿದ್ದೀರಿ.',
  },
  trip_taken: { en: 'That trip was already taken.', kn: 'ಆ ಪ್ರಯಾಣ ಈಗಾಗಲೇ ಆಗಿದೆ.' },
  trip_expired: {
    en: 'That trip is no longer available - the rider stopped waiting.',
    kn: 'ಆ ಪ್ರಯಾಣ ಈಗ ಲಭ್ಯವಿಲ್ಲ - ಪ್ರಯಾಣಿಕರು ಕಾಯುವುದನ್ನು ನಿಲ್ಲಿಸಿದರು.',
  },
  quote_prompt: {
    en: 'How much will you charge? Reply with the amount in rupees, like 70.',
    kn: 'ಎಷ್ಟು ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಿ? ರೂಪಾಯಿಯಲ್ಲಿ ಮೊತ್ತ ಕಳುಹಿಸಿ, ಉದಾ 70.',
  },
  you_got_trip: {
    en: '*You got the trip* - {amount}\n\n*Rider* {rider}\n*Call* {phone}\n\n*Pickup*\n{pickup}',
    kn: '*ಪ್ರಯಾಣ ಸಿಕ್ಕಿತು* - {amount}\n\n*ಪ್ರಯಾಣಿಕ* {rider}\n*ಕರೆ* {phone}\n\n*ಪಿಕಪ್*\n{pickup}',
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
  otp_ok: { en: 'Trip started.', kn: 'ಪ್ರಯಾಣ ಆರಂಭ.' },
  otp_wrong: { en: 'Wrong code. Try again.', kn: 'ತಪ್ಪು ಕೋಡ್. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' },
  otp_blocked: { en: 'Too many attempts. Please call the office.', kn: 'ತುಂಬಾ ಪ್ರಯತ್ನಗಳು. ದಯವಿಟ್ಟು ಕಚೇರಿಗೆ ಕರೆ ಮಾಡಿ.' },
  ask_done: { en: 'Send DONE when you drop the rider.', kn: 'ಪ್ರಯಾಣಿಕರನ್ನು ಬಿಟ್ಟ ಮೇಲೆ DONE ಕಳುಹಿಸಿ.' },
  done_recorded: { en: 'Noted. Waiting for the rider to confirm.', kn: 'ಗುರುತಿಸಲಾಗಿದೆ. ಪ್ರಯಾಣಿಕರ ದೃಢೀಕರಣಕ್ಕೆ ಕಾಯಲಾಗುತ್ತಿದೆ.' },
  rate_rider: { en: 'Rate {rider} - how was the trip?', kn: '{rider} ಗೆ ರೇಟಿಂಗ್ - ಪ್ರಯಾಣ ಹೇಗಿತ್ತು?' },
  cancel_reason_prompt: {
    en: 'Sorry about that. Why are you cancelling?',
    kn: 'ಕ್ಷಮಿಸಿ. ಏಕೆ ರದ್ದು ಮಾಡುತ್ತಿದ್ದೀರಿ?',
  },
  cancel_reason_typed_prompt: {
    en: 'Please type the reason in a few words.',
    kn: 'ದಯವಿಟ್ಟು ಕಾರಣವನ್ನು ಕೆಲವು ಪದಗಳಲ್ಲಿ ಬರೆಯಿರಿ.',
  },
  reason_other: { en: 'Other', kn: 'ಬೇರೆ ಕಾರಣ' },

  // Rider reasons
  reason_got_another_auto: { en: 'Got another auto', kn: 'ಬೇರೆ ಆಟೋ ಸಿಕ್ಕಿತು' },
  reason_changed_mind: { en: 'Changed my mind', kn: 'ಮನಸ್ಸು ಬದಲಾಯಿತು' },
  reason_long_wait: { en: 'Waiting too long', kn: 'ತುಂಬಾ ಕಾಯುತ್ತಿದ್ದೇನೆ' },
  reason_mistake: { en: 'Booked by mistake', kn: 'ತಪ್ಪಾಗಿ ಬುಕ್ ಆಗಿದೆ' },

  // Driver reasons
  reason_unreachable: { en: 'Rider not answering', kn: 'ಪ್ರಯಾಣಿಕ ಉತ್ತರಿಸುತ್ತಿಲ್ಲ' },
  reason_too_far: { en: 'Too far', kn: 'ತುಂಬಾ ದೂರ' },
  reason_vehicle_problem: { en: 'Vehicle problem', kn: 'ವಾಹನ ಸಮಸ್ಯೆ' },
  reason_not_available: { en: 'Not available now', kn: 'ಈಗ ಲಭ್ಯವಿಲ್ಲ' },

  cancel_other_hint: {
    en: 'We are finding another auto for you.',
    kn: 'ನಿಮಗೆ ಇನ್ನೊಂದು ಆಟೋ ಹುಡುಕುತ್ತಿದ್ದೇವೆ.',
  },
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
    en: 'Your subscription ended. Pay {price} to keep receiving trips - contact {contact}.',
    kn: 'ನಿಮ್ಮ ಚಂದಾದಾರಿಕೆ ಮುಗಿಯಿತು. ಪ್ರಯಾಣಗಳು ಬರಲು {price} ಪಾವತಿಸಿ - {contact} ಸಂಪರ್ಕಿಸಿ.',
  },
  update_base: { en: 'Update where you wait to this location?', kn: 'ನೀವು ಕಾಯುವ ಸ್ಥಳವನ್ನು ಇದಕ್ಕೆ ಬದಲಿಸುವುದೇ?' },
  base_updated: { en: 'Location updated.', kn: 'ಸ್ಥಳ ಬದಲಾಗಿದೆ.' },
  driver_help: {
    en: 'Reply with a number to quote. Send your location to update where you wait.',
    kn: 'ಬೆಲೆ ಹೇಳಲು ಸಂಖ್ಯೆ ಕಳುಹಿಸಿ. ಕಾಯುವ ಸ್ಥಳ ಬದಲಿಸಲು ಸ್ಥಳ ಕಳುಹಿಸಿ.',
  },
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
