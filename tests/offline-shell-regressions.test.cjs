/* CommonJS is used by the Node regression test runner. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const workerCode = require('../scripts/offline-shell-code.cjs');
function worker() {
  const events = new Map(), stores = new Map(), deleted = [], requests = [];
  const cache = name => ({ addAll: async urls => { stores.set(name, new Map(urls.map(url => [url, new Response(url === '/mapas' ? 'OFFLINE MAPS' : 'PUBLIC SHELL')]))); }, match: async request => stores.get(name)?.get(typeof request === 'string' ? request : new URL(request.url).pathname)?.clone() });
  const globals = {
    self: { location: { origin: 'https://autoram.example' }, addEventListener: (name, handler) => events.set(name, handler), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async name => cache(name), keys: async () => ['autoram-app-previous', 'autoram-map-fonts-v1', 'unrelated-cache'], delete: async name => { deleted.push(name); }, match: async () => undefined },
    fetch: async request => { requests.push(request.url); throw new Error('offline'); }, URL, Response, AbortSignal,
  };
  const source = workerCode(fs.readFileSync('scripts/offline-worker.template.js', 'utf8'), ['/', '/mapas', '/_next/static/example.js'], 'test-version');
  vm.runInNewContext(source, globals);
  const dispatch = async (name, extra = {}) => { let pending; events.get(name)({ waitUntil: value => { pending = value; }, respondWith: value => { pending = value; }, ...extra }); return pending ? await pending : undefined; };
  return { dispatch, deleted, stores, requests };
}
const request = (pathname, overrides = {}) => ({ url: `https://autoram.example${pathname}`, method: 'GET', mode: 'cors', headers: new Headers(), ...overrides });
test('public maps page opens from an installed shell when every network request fails', async () => {
  const { dispatch } = worker();
  await dispatch('install');
  const result = await dispatch('fetch', { request: request('/mapas', { mode: 'navigate' }) });
  assert.equal(await result.text(), 'OFFLINE MAPS');
});
test('offline worker ignores Auth, database, private images, authenticated requests and PMTiles ranges', async () => {
  const { dispatch, requests } = worker();
  for (const path of ['/auth/v1/token', '/api/user', '/rest/v1/vehicles', '/storage/v1/object/private/photo', '/maps/llano-v1.pmtiles']) assert.equal(await dispatch('fetch', { request: request(path) }), undefined);
  assert.equal(await dispatch('fetch', { request: request('/_next/static/example.js', { headers: new Headers({ authorization: 'Bearer test-value' }) }) }), undefined);
  assert.equal(await dispatch('fetch', { request: request('/', { method: 'POST' }) }), undefined);
  assert.equal(requests.length, 0);
});
test('worker update retains downloaded-map fonts and unrelated caches', async () => {
  const { dispatch, deleted } = worker();
  await dispatch('activate');
  assert.deepEqual(deleted, ['autoram-app-previous']);
});
test('runtime signed-in HTML is never written over the public offline shell', async () => {
  const { dispatch, stores } = worker();
  await dispatch('install');
  await dispatch('fetch', { request: request('/', { mode: 'navigate' }) });
  assert.equal(await stores.get('autoram-app-test-version').get('/').text(), 'PUBLIC SHELL');
});
