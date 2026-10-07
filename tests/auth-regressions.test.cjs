const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, errors } = require('./helpers.cjs');

function setup(settings, oauthError = null) {
  const requests = [], redirects = [];
  const api = evaluate('lib/supabase-browser.ts', id => {
    if (id.includes('supabase-js')) return { createClient: () => ({ auth: { signInWithOAuth: async options => {
      redirects.push(JSON.parse(JSON.stringify(options)));
      return { data: { url: 'https://accounts.google.com' }, error: oauthError };
    } } }) };
    return id.includes('errors') ? errors : {};
  }, {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (settings instanceof Error) throw settings;
      return new Response(JSON.stringify(settings.body), { status: settings.status || 200 });
    },
  });
  return { api, requests, redirects };
}

test('a disabled Google provider keeps the user on the login form', async () => {
  const env = setup({ body: { external: { google: false, email: true } } });
  await assert.rejects(env.api.signInWithGoogle('https://autoram-app-colombia.netlify.app'), /aún no está habilitado/);
  assert.equal(env.redirects.length, 0);
});

test('an enabled provider signs in with Google and returns to the current app', async () => {
  const env = setup({ body: { external: { google: true } } });
  await env.api.signInWithGoogle('https://autoram-app-colombia.netlify.app');
  assert.deepEqual(env.redirects, [{ provider: 'google', options: { redirectTo: 'https://autoram-app-colombia.netlify.app' } }]);
  assert.equal(env.requests[0].options.headers.apikey, 'sb_publishable_test');
});

test('settings failures do not navigate away or attempt OAuth', async () => {
  for (const settings of [{ status: 503, body: {} }, new Error('Failed to fetch'), { body: {} }]) {
    const env = setup(settings);
    await assert.rejects(env.api.signInWithGoogle('https://autoram-app-colombia.netlify.app'));
    assert.equal(env.redirects.length, 0);
  }
});

test('OAuth errors are returned to the form', async () => {
  const env = setup({ body: { external: { google: true } } }, { message: 'Provider unavailable' });
  await assert.rejects(env.api.signInWithGoogle('https://autoram-app-colombia.netlify.app'), /Provider unavailable/);
});

test('network and credential errors explain how to recover in Spanish', () => {
  assert.match(errors.authErrorMessage({ message: 'Failed to fetch' }), /Revisa tu conexión/);
  assert.match(errors.authErrorMessage({ message: 'Invalid login credentials' }), /correo o la contraseña/);
  assert.match(errors.authErrorMessage({ message: 'Email not confirmed' }), /Confirma tu correo/);
});
