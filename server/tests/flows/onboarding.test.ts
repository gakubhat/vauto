import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import {
  messageLog,
  setupMockSendMessage,
  stateOf,
  truncateAll,
} from '../engine';
import { handleOnboarding, startOnboarding } from '../../src/state/onboarding';
import { getSession } from '../../src/state/store';

const NEW = '+919999000031';
const NEW2 = '+919999000032';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
});

describe('new user onboarding', () => {
  it('welcomes, asks for language, then asks for role', async () => {
    await startOnboarding(NEW);

    expect((await stateOf(NEW))?.state).toBe('awaiting_language');
    expect((await stateOf(NEW))?.role).toBeNull();

    const first = messageLog.filter((m) => m.to === NEW);
    expect(first).toHaveLength(1);
    expect(first[0].msg.kind).toBe('buttons');
    const body = (first[0].msg as { body: string }).body;
    expect(body).toContain('Welcome to VJobs');
    expect(body).toContain('ವಿಜಾಬ್ಸ್');

    const ids = (first[0].msg as { buttons: Array<{ id: string }> }).buttons.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['lang_kannada', 'lang_english']));

    // Choosing a language moves to the role question, in that language.
    let session = (await getSession(NEW)) as never;
    await handleOnboarding(NEW, session, 'lang_english');
    expect((await stateOf(NEW))?.state).toBe('awaiting_role');

    const roleMsg = messageLog.filter((m) => m.to === NEW).slice(-1)[0];
    const roleBody = (roleMsg.msg as { body: string }).body;
    expect(roleBody).toContain('Are you here to book an auto');
  }, 60000);

  it('saves the chosen language onto the rider record and asks for a name', async () => {
    await startOnboarding(NEW);
    let session = (await getSession(NEW)) as never;
    await handleOnboarding(NEW, session, 'lang_english');

    session = (await getSession(NEW)) as never;
    await handleOnboarding(NEW, session, 'role_rider');

    expect((await stateOf(NEW))?.state).toBe('awaiting_name');
    expect((await stateOf(NEW))?.role).toBe('rider');

    const { data } = await supabaseAdmin.from('riders').select('*').eq('phone', NEW).single();
    expect((data as { preferred_language: string }).preferred_language).toBe('english');
  }, 60000);

  it('saves the chosen language onto the driver record', async () => {
    await startOnboarding(NEW2);
    let session = (await getSession(NEW2)) as never;
    await handleOnboarding(NEW2, session, 'lang_kannada');

    session = (await getSession(NEW2)) as never;
    await handleOnboarding(NEW2, session, 'role_driver');

    expect((await stateOf(NEW2))?.state).toBe('awaiting_driver_name');
    expect((await stateOf(NEW2))?.role).toBe('driver');

    const { data } = await supabaseAdmin.from('drivers').select('*').eq('phone', NEW2).single();
    expect((data as { preferred_language: string }).preferred_language).toBe('kannada');
  }, 60000);

  it('re-prompts instead of advancing on unrecognised input', async () => {
    await startOnboarding(NEW);
    const session = (await getSession(NEW)) as never;

    await handleOnboarding(NEW, session, 'hello');
    expect((await stateOf(NEW))?.state).toBe('awaiting_language');

    const s2 = (await getSession(NEW)) as never;
    await handleOnboarding(NEW, s2, 'lang_kannada');
    const s3 = (await getSession(NEW)) as never;
    await handleOnboarding(NEW, s3, 'maybe');
    expect((await stateOf(NEW))?.state).toBe('awaiting_role');
  }, 60000);
});
