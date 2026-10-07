const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, errors, offlineStore } = require('./helpers.cjs');
const cacheKey = 'autoram.account.cache.v1';
const account = { driver: { fullName: 'Test' }, vehicle: { id: 7 }, vehicles: [{ id: 7 }], activeVehicleId: 7, fuel: [], maintenance: [], trips: [], quotes: [], documents: [], work: [{ id: 42, vehicleId: 7, endedAt: null }], summary: { stale: true } };
function setup({ online = false, owner = 'owner', cached = account, cachedOwner = 'owner', query, storage } = {}) {
  const navigator = { onLine: online }, store = offlineStore({ navigator }), memory = new Map(); let requests = 0;
  if (cached) memory.set(cacheKey, JSON.stringify({ userId: cachedOwner, account: cached }));
  const client = { storage, auth: { getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) }, from(table) {
    requests++; if (!query) throw { message: 'Failed to fetch', code: 'NETWORK' }; return query(table, store);
  } };
  const api = evaluate('lib/supabase-browser.ts', id => id.includes('supabase-js') ? { createClient: () => client } : id.includes('errors') ? errors : store,
    { navigator, localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) }, window: { location: { origin: 'https://autoram.test' } }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } } });
  const post = (action, data) => api.autoramFetch('/api/autoram', { method: 'POST', body: JSON.stringify({ action, data }) });
  return { ...store, api, post, memory, get requests() { return requests; } };
}
const values = {
  addFuel: { occurredAt: '2026-10-06', odometer: 100, station: 'Test', fuelType: 'Gasolina', gallons: 2, pricePerGallon: 15000, total: 30000 },
  addMaintenance: { occurredAt: '2026-10-06', odometer: 100, movementType: 'Servicio', category: 'Aceite', issue: '', workDone: 'Cambio', shop: 'Test', laborCost: 1, partsCost: 2, total: 3, nextKm: null },
  addTrip: { startedAt: '2026-10-06T12:00:00Z', endedAt: '2026-10-06T12:01:00Z', distanceKm: 1, durationSeconds: 60, startLat: 4, startLng: -73, endLat: 4.01, endLng: -73 },
  saveQuote: { serviceName: 'Test', totalKm: 10, fuelPrice: 15000, efficiencyKpg: 35, recommendedPrice: 20000 },
  addDocument: { documentType: 'SOAT', expiresAt: '2027-01-01' },
  finishWork: { id: 42, endOdometer: 110, income: 100000, expenses: 20000 },
};
for (const [action, data] of Object.entries(values)) test(`${action} saves offline without a remote vehicle lookup and survives reload`, async () => {
  const env = setup(), response = await env.post(action, data), body = await response.json();
  assert.equal(response.status, 201); assert.equal(body.queued, true); assert.equal(env.requests, 0); assert.equal(env.records.size, 1);
  const reloaded = await (await env.api.autoramFetch('/api/autoram')).json(); assert.equal(reloaded.offline, true); assert.equal(reloaded.summary, null);
  if (action === 'finishWork') assert(reloaded.work[0].endedAt); else { const key = { addFuel: 'fuel', addMaintenance: 'maintenance', addTrip: 'trips', saveQuote: 'quotes', addDocument: 'documents' }[action]; assert.equal(reloaded[key].length, 1); assert(reloaded[key][0].id < 0); assert.equal(reloaded[key][0].vehicleId, 7); }
});
test('network error objects preserve the message and allow cached account fallback', async () => { const env = setup({ online: true }); const response = await env.api.autoramFetch('/api/autoram'); assert.equal(response.status, 200); assert.equal((await response.json()).offline, true); });
test('offline cache and writes never use a different account', async () => { const env = setup({ owner: 'another-user' }); const response = await env.post('addFuel', values.addFuel); assert.equal(response.status, 500); assert.equal(env.records.size, 0); assert.equal(env.requests, 0); });
test('an insert is durable before the network starts and acknowledged only after success', async () => {
  const env = setup({ online: true, query: (table, store) => ({ insert(payload) {
    assert.equal(store.records.size, 1); assert(store.records.has(payload.client_id));
    return { select: () => ({ single: async () => ({ error: null, data: { id: 99, created_at: '2026-10-06T12:00:00Z' } }) }) };
  } }) });
  const response = await env.post('addFuel', values.addFuel); assert.equal(response.status, 201); assert.equal(env.records.size, 0);
  const cached = JSON.parse(env.memory.get(cacheKey)).account; assert.equal(cached.fuel[0].id, 99);
});
test('a thrown network error preserves the local record', async () => { const env = setup({ online: true }); const response = await env.post('addFuel', values.addFuel); assert.equal(response.status, 201); assert.equal(env.records.size, 1); assert.match([...env.records.values()][0].last_error, /Failed to fetch/); });
test('production build refuses missing public configuration and secret keys', () => {
  for (const env of [{}, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }]) {
    const config = evaluate('next.config.ts', () => ({ PHASE_PRODUCTION_BUILD: 'build' }), { process: { env } }).default;
    assert.throws(() => config('build'));
  }
});
test('saving a private vehicle photo persists its object path and refreshes its temporary URL', async () => {
  let persisted;
  const env = setup({ online: true, storage: { from: bucket => {
    assert.equal(bucket, 'vehicle-images');
    return { createSignedUrl: async (path, seconds) => {
      assert.equal(path, 'owner/photo.jpg'); assert.equal(seconds, 3600);
      return { data: { signedUrl: 'https://storage.test/fresh' }, error: null };
    } };
  } }, query: table => table === 'vehicles' ? { insert: values => {
    persisted = values.image_url;
    return { select: () => ({ single: async () => ({ data: { ...values, id: 7 }, error: null }) }) };
  } } : { upsert: async () => ({ error: null }) } });
  const response = await env.post('addVehicle', { type: 'Carro', year: '2024', plate: 'ABC123', odometer: '0', imageUrl: 'https://storage.test/expired', imageStoragePath: 'owner/photo.jpg' });
  const body = await response.json();
  assert.equal(response.status, 201); assert.equal(persisted, 'storage://vehicle-images/owner/photo.jpg');
  assert.equal(body.vehicle.imageUrl, 'https://storage.test/fresh'); assert.equal(body.vehicle.imageStoragePath, 'owner/photo.jpg');
});
test('an inaccessible private photo does not block loading the rest of the account', async () => {
  const env = setup({ online: true, storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'Not authorized' } }) }) }, query: table => {
    const result = { data: table === 'vehicles' ? [{ id: 7, image_url: 'storage://vehicle-images/owner/photo.jpg' }] : [], error: null };
    const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, maybeSingle: async () => ({ data: null, error: null }), then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return builder;
  } });
  const response = await env.api.autoramFetch('/api/autoram'); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.vehicles[0].id, 7); assert.equal(body.vehicles[0].imageUrl, '');
  assert.equal(body.vehicles[0].imageStoragePath, 'owner/photo.jpg');
});
