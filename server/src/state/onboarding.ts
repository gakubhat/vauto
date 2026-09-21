import { langOf, type Lang } from '../whatsapp/i18n';
import { send } from '../lib/send';
import * as tpl from '../whatsapp/templates';
import { ensureDriver, ensureRider } from './queries';
import { upsertSession, type Session } from './store';

export const STATE_LANGUAGE = 'awaiting_language';
export const STATE_ROLE = 'awaiting_role';

/** First contact with a number we have never seen. */
export async function startOnboarding(phone: string): Promise<void> {
  await upsertSession(phone, { state: STATE_LANGUAGE, role: null, data: {} });
  await send(phone, 'rider', tpl.welcomeAndLanguage(), { sessionState: STATE_LANGUAGE });
}

function langOfChoice(text: string): Lang | null {
  if (text === 'lang_kannada') return 'kannada';
  if (text === 'lang_english') return 'english';
  return null;
}

/**
 * Handles the two pre-role states: language choice, then rider/driver choice.
 * Always sends something, so a null-role session can never go unanswered.
 */
export async function handleOnboarding(
  phone: string,
  session: Session,
  text: string,
): Promise<void> {
  const lang = langOf((session.data?.preferred_language as string) ?? null);

  if (session.state === STATE_LANGUAGE) {
    const choice = langOfChoice(text);
    if (!choice) {
      await send(phone, 'rider', tpl.welcomeAndLanguage(), { sessionState: STATE_LANGUAGE });
      return;
    }
    await upsertSession(phone, { state: STATE_ROLE, data: { preferred_language: choice } });
    await send(phone, 'rider', tpl.roleSelection(choice), { sessionState: STATE_ROLE });
    return;
  }

  if (session.state === STATE_ROLE) {
    if (text !== 'role_rider' && text !== 'role_driver') {
      await send(phone, 'rider', tpl.roleSelection(lang), { sessionState: STATE_ROLE });
      return;
    }

    const preferred = (langOfChoice(text) ?? lang) as Lang;
    const chosen = langOf((session.data?.preferred_language as string) ?? preferred);

    if (text === 'role_rider') {
      const rider = await ensureRider(phone);
      await upsertSession(phone, {
        state: 'awaiting_name',
        role: 'rider',
        data: { preferred_language: chosen },
      });
      void rider;
      await persistRiderLanguage(phone, chosen);
      await send(phone, 'rider', tpl.askName(chosen), { sessionState: 'awaiting_name' });
      return;
    }

    const driver = await ensureDriver(phone);
    await upsertSession(phone, {
      state: 'awaiting_driver_name',
      role: 'driver',
      data: { preferred_language: chosen },
    });
    void driver;
    await persistDriverLanguage(phone, chosen);
    await send(phone, 'driver', tpl.askDriverName(chosen), {
      sessionState: 'awaiting_driver_name',
    });
    return;
  }

  // Role is null but we are in some other state - restart onboarding cleanly.
  await startOnboarding(phone);
}

async function persistRiderLanguage(phone: string, lang: Lang): Promise<void> {
  const { supabaseAdmin } = await import('../supabase/client');
  await supabaseAdmin.from('riders').update({ preferred_language: lang }).eq('phone', phone);
}

async function persistDriverLanguage(phone: string, lang: Lang): Promise<void> {
  const { supabaseAdmin } = await import('../supabase/client');
  await supabaseAdmin.from('drivers').update({ preferred_language: lang }).eq('phone', phone);
}
