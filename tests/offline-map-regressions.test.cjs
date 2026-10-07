/* CommonJS is used by the Node regression test runner. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');
const pmtiles = require('pmtiles');
const fixture = require('./map-fixture.cjs');
const { evaluate } = require('./helpers.cjs');
const definitions = require('../data/map-regions.json');
const region = { ...definitions[0], path: '/maps/llano-v1.pmtiles', bytes: fixture.length, sha256: createHash('sha256').update(fixture).digest('hex') };
function harness(overrides = {}) {
  const savedResponses = new Map();
  const globals = {
    indexedDB: new IDBFactory(), Blob, File, Uint8Array, ArrayBuffer, Event,
    crypto: webcrypto,
    navigator: { onLine: true, storage: { estimate: async () => ({ quota: 100_000_000, usage: 0 }), persist: async () => true } },
    window: { dispatchEvent() {} },
    caches: { open: async () => ({ match: async key => savedResponses.get(key)?.clone(), put: async (key, response) => savedResponses.set(key, response.clone()) }) },
    fetch: async url => url.endsWith('.pbf') ? new Response(new Uint8Array([1, 2, 3])) : new Response(fixture),
    ...overrides,
  };
  const imports = path => path === 'pmtiles' ? pmtiles : { default: definitions };
  return { module: evaluate('lib/offline-maps.ts', imports, globals), globals, imports };
}
test('verified map survives a cold reopen and PMTiles reads real vector tiles with fetch disabled', async () => {
  const { module, globals, imports } = harness();
  await module.downloadMap(region, new AbortController().signal, () => {});
  assert.equal((await module.listSavedMaps())[0].bytes, fixture.length);
  let calls = 0;
  const reopened = evaluate('lib/offline-maps.ts', imports, { ...globals, fetch: async () => { calls++; throw new Error('offline'); }, navigator: { onLine: false } });
  const archive = new pmtiles.PMTiles({ getKey: () => 'stored-region', getBytes: async (offset, length) => ({ data: await reopened.readStoredRange(region.id, offset, length) }) });
  const header = await archive.getHeader();
  assert.equal(header.tileType, pmtiles.TileType.Mvt);
  const z = 15, x = Math.floor(((-73.635 + 180) / 360) * 2 ** z), rad = 4.105 * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z);
  const tile = await archive.getZxy(z, x, y);
  assert.ok(tile.data.byteLength > 1000);
  assert.equal(calls, 0);
});
test('corrupt replacement preserves the previously verified map', async () => {
  const { module, globals } = harness();
  await module.downloadMap(region, new AbortController().signal, () => {});
  const corrupt = Buffer.from(fixture); corrupt[corrupt.length - 1] ^= 1;
  globals.fetch = async () => new Response(corrupt);
  const broken = evaluate('lib/offline-maps.ts', path => path === 'pmtiles' ? pmtiles : { default: definitions }, globals);
  await assert.rejects(broken.downloadMap(region, new AbortController().signal, () => {}), /verificar/);
  assert.equal((await broken.listSavedMaps())[0].sha256, region.sha256);
});
test('interrupted download never appears as available offline', async () => {
  const { module } = harness();
  const abort = new AbortController();
  await assert.rejects(module.downloadMap(region, abort.signal, () => abort.abort()), error => error.name === 'AbortError');
  assert.equal((await module.listSavedMaps()).length, 0);
});
test('insufficient storage fails before any map or font network request', async () => {
  let calls = 0;
  const { module } = harness({ navigator: { storage: { estimate: async () => ({ quota: 1000, usage: 999 }) } }, fetch: async () => { calls++; } });
  await assert.rejects(module.downloadMap(region, new AbortController().signal, () => {}), /espacio/);
  assert.equal(calls, 0);
});
test('deleting a map removes its stored byte source', async () => {
  const { module } = harness();
  await module.downloadMap(region, new AbortController().signal, () => {});
  assert.ok(await module.readStoredRange(region.id, 0, 127));
  await module.deleteSavedMap(region.id);
  assert.equal(await module.readStoredRange(region.id, 0, 127), null);
});
