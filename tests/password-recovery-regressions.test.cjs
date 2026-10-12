/* eslint-disable @typescript-eslint/no-require-imports -- Node's regression harness uses CommonJS. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, errors } = require('./helpers.cjs');

const recovery = evaluate('lib/password-recovery.ts', () => errors, { URLSearchParams });
const origin = 'https://autoram-app-colombia.netlify.app';
const link = `${origin}/?auth=recovery#type=recovery&access_token=valid-recovery-fixture`;

function setup({ sessionError, userError, updateError, sendError, verifiedId = 'driver-a', session = undefined } = {}) {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const calls = [];
  const auth = {
    getSession: async () => ({ data: { session: session === undefined ? { user: { id: 'driver-a' }, access_token: 'valid-recovery-fixture' } : session }, error: sessionError || null }),
    getUser: async () => { calls.push({ action: 'verify' }); return { data: { user: verifiedId ? { id: verifiedId } : null }, error: userError || null }; },
    resetPasswordForEmail: async (email, options) => { calls.push({ action: 'request', email, options: JSON.parse(JSON.stringify(options)) }); return { data: {}, error: sendError || null }; },
    updateUser: async options => { calls.push({ action: 'update', options: JSON.parse(JSON.stringify(options)) }); return { data: {}, error: updateError || null }; },
  };
  return { auth, storage, values, calls };
}

test('recovery emails return to the same deployed app and do not reveal account existence', async () => {
  for (const site of [origin, 'https://sparkly-rugelach-c10f4b.netlify.app']) {
    const env = setup();
    const message = await recovery.requestPasswordRecovery(env.auth, '  driver@example.com  ', site);
    assert.equal(message, recovery.RECOVERY_SENT);
    assert.match(message, /Si ese correo tiene una cuenta/);
    assert.deepEqual(env.calls, [{ action: 'request', email: 'driver@example.com', options: { redirectTo: `${site}/?auth=recovery` } }]);
  }
});

test('invalid addresses and SMTP failures never show a successful send', async () => {
  const invalid = setup();
  await assert.rejects(recovery.requestPasswordRecovery(invalid.auth, 'incorrecto', origin), /correo electrónico válido/);
  assert.equal(invalid.calls.length, 0);
  for (const sendError of [{ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' }, { message: 'Error sending recovery email' }, new Error('Failed to fetch')]) {
    const env = setup({ sendError });
    await assert.rejects(recovery.requestPasswordRecovery(env.auth, 'driver@example.com', origin));
  }
});

test('a fresh recovery link is verified by Supabase before showing a new-password form', async () => {
  const env = setup();
  assert.equal(await recovery.resolvePasswordRecovery(env.auth, link, env.storage), 'driver-a');
  assert.deepEqual(env.calls, [{ action: 'verify' }]);
  const stored = [...env.values.values()].join();
  assert.match(stored, /driver-a/);
  assert.doesNotMatch(stored, /valid-recovery-fixture|password|access_token|refresh_token/);
  // Reloading after the SDK removes the token retains this same account's recovery screen.
  assert.equal(await recovery.resolvePasswordRecovery(env.auth, `${origin}/?auth=recovery`, env.storage), 'driver-a');
});

test('opening a recovery URL alone cannot change an ordinary logged-in account', async () => {
  for (const href of [`${origin}/?auth=recovery`, `${origin}/#type=recovery`, `${origin}/#type=recovery&access_token=another-account`]) {
    const env = setup();
    await assert.rejects(recovery.resolvePasswordRecovery(env.auth, href, env.storage), /venció o ya fue usado/);
    assert.equal(env.calls.length, 0);
  }
});

test('missing, failed and wrong-account recovery sessions never authorize an update', async () => {
  for (const options of [{ session: null }, { sessionError: new Error('Failed to fetch') }, { userError: { message: 'expired', code: 'bad_jwt' } }, { verifiedId: 'driver-b' }]) {
    const env = setup(options);
    await assert.rejects(recovery.resolvePasswordRecovery(env.auth, link, env.storage));
    assert.equal(env.values.size, 0);
    assert.equal(env.calls.filter(call => call.action === 'update').length, 0);
  }
});

test('expired or reused email links discard recovery context even with a saved session', async () => {
  const env = setup();
  await recovery.resolvePasswordRecovery(env.auth, link, env.storage);
  await assert.rejects(recovery.resolvePasswordRecovery(env.auth, `${origin}/?auth=recovery#error=access_denied&error_code=otp_expired`, env.storage), /venció/);
  assert.equal(env.values.size, 0);
  await assert.rejects(recovery.resolvePasswordRecovery(env.auth, `${origin}/?auth=recovery`, env.storage), /venció/);
});

test('recovery context expires and is isolated between users in the same browser', async () => {
  const env = setup();
  await recovery.resolvePasswordRecovery(env.auth, link, env.storage);
  const [key, value] = [...env.values.entries()][0];
  env.values.set(key, JSON.stringify({ ...JSON.parse(value), until: Date.now() - 1 }));
  await assert.rejects(recovery.resolvePasswordRecovery(env.auth, `${origin}/?auth=recovery`, env.storage));
  env.values.set(key, JSON.stringify({ userId: 'driver-b', until: Date.now() + 10000 }));
  await assert.rejects(recovery.resolvePasswordRecovery(env.auth, `${origin}/?auth=recovery`, env.storage));
});

test('short and mismatched passwords never reach Supabase', async () => {
  const env = setup();
  await assert.rejects(recovery.updateRecoveredPassword(env.auth, 'driver-a', 'short', 'short'), /8 caracteres/);
  await assert.rejects(recovery.updateRecoveredPassword(env.auth, 'driver-a', '        ', '        '), /8 caracteres/);
  await assert.rejects(recovery.updateRecoveredPassword(env.auth, 'driver-a', 'long-fixture-a', 'long-fixture-b'), /no coinciden/);
  assert.equal(env.calls.length, 0);
});

test('changing accounts or losing a session blocks the password update', async () => {
  for (const options of [{ verifiedId: 'driver-b' }, { verifiedId: null }, { userError: { message: 'Session missing', code: 'session_not_found' } }]) {
    const env = setup(options);
    await assert.rejects(recovery.updateRecoveredPassword(env.auth, 'driver-a', 'valid-fixture', 'valid-fixture'));
    assert.equal(env.calls.filter(call => call.action === 'update').length, 0);
  }
});

test('a confirmed password is updated only for the verified recovery user', async () => {
  const env = setup();
  await recovery.updateRecoveredPassword(env.auth, 'driver-a', 'valid-fixture', 'valid-fixture');
  assert.deepEqual(env.calls, [{ action: 'verify' }, { action: 'update', options: { password: 'valid-fixture' } }]);
  recovery.clearPasswordRecovery(env.storage);
  assert.equal(env.values.size, 0);
});

test('failed password updates preserve the error and are never reported as saved', async () => {
  const env = setup({ updateError: { message: 'New password should be different', code: 'same_password' } });
  await assert.rejects(recovery.updateRecoveredPassword(env.auth, 'driver-a', 'valid-fixture', 'valid-fixture'), error => error.code === 'same_password');
});

test('recovery errors explain expiry, throttling and password requirements in Spanish', () => {
  assert.match(errors.authErrorMessage({ code: 'otp_expired', message: 'Email link is invalid or has expired' }), /Solicita un nuevo correo/);
  assert.match(errors.authErrorMessage({ code: 'over_email_send_rate_limit', message: 'rate limit' }), /Espera unos minutos/);
  assert.match(errors.authErrorMessage({ code: 'same_password', message: 'same' }), /diferente/);
  assert.match(errors.authErrorMessage({ code: 'weak_password', message: 'weak' }), /8 caracteres/);
  assert.match(errors.authErrorMessage({ code: 'email_address_not_authorized', message: 'not allowed' }), /servicio de correo/);
  assert.equal(recovery.isPasswordRecoveryURL(link), true);
  assert.equal(recovery.isPasswordRecoveryURL(`${origin}/?auth=recovery`), true);
  assert.equal(recovery.isPasswordRecoveryURL(`${origin}/#type=signup`), false);
});
