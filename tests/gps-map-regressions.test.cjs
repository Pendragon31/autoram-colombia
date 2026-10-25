/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { evaluate, errors, offlineStore } = require('./helpers.cjs');
const geo = evaluate('lib/geo.ts', () => {});
function compile(source, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: imports, console, ...globals });
  return exports;
}
const points = [[4.15, -73.63, 1], [4.151, -73.63, 10001], [4.2, -73.63, 50001, 1], [4.201, -73.63, 60001]];
test('the WebGL map sends separate line segments to MapLibre without a bridge across the gap', () => {
  const source = fs.readFileSync('components/trip-map.tsx', 'utf8');
  const fn = source.slice(source.indexOf('function toLineGeoJSON('), source.indexOf('function toMarkersGeoJSON('));
  const convert = compile(fn + '\nexports.convert=toLineGeoJSON;', require, { trackGeometry: geo.trackGeometry }).convert;
  const line = convert(points); assert.equal(line.geometry.type, 'MultiLineString');
  assert.equal(line.geometry.coordinates.length, 2); assert.equal(line.geometry.coordinates[0].length, 2);
});
test('the lightweight map also lifts its pen at a persisted gap boundary', async () => {
  const effects = [], draw = []; let ref = 0, state = 0;
  const context = { setTransform() {}, fillRect() {}, beginPath() {}, moveTo() { draw.push('move'); }, lineTo() { draw.push('line'); }, stroke() {}, setLineDash() {}, arc() {}, fill() {} };
  const react = {
    useRef(value) { const i = ref++; return { current: i === 0 ? {} : i === 1 ? { getContext: () => context } : value }; },
    useState(value) { const i = state++; return [i === 1 ? [320, 320] : value, () => {}]; },
    useEffect(fn) { effects.push(fn); },
  };
  const CanvasMap = compile(fs.readFileSync('components/canvas-map.tsx', 'utf8'), id => {
    if (id === 'react') return react;
    if (id.includes('/lib/geo')) return geo;
    if (id.includes('offline-maps')) return { regionAt: () => null };
    if (id.includes('map-archive')) return {};
    if (id.includes('/lib/canvas-map')) return { fitView: () => null, worldPoint: (lng, lat) => [lng, lat] };
    if (id === 'lucide-react') return { LocateFixed: () => null, Minus: () => null, Plus: () => null };
    return require(id);
  }, { window: { devicePixelRatio: 1 }, navigator: { onLine: false }, AbortController, ResizeObserver: class { observe() {} disconnect() {} } }).default;
  CanvasMap({ center: [-73.63, 4.15], points });
  const cleanups = effects.map(fn => fn()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(draw.filter(x => x === 'move').length, 4);
  assert.equal(draw.filter(x => x === 'line').length, 4);
  for (const cleanup of cleanups) cleanup?.();
});
test('quality UI states its estimated precision, last valid age and missing-distance policy', () => {
  const Quality = compile(fs.readFileSync('components/gps-quality.tsx', 'utf8'), require).default;
  const html = renderToStaticMarkup(React.createElement(Quality, { signal: { label: 'Sin ubicación reciente', tone: 'poor', ageSeconds: 35 }, accuracyM: 20, gapCount: 1 }));
  assert.match(html, /Calidad del GPS/); assert.match(html, /± 20 m/); assert.match(html, /hace 35 s/);
  assert.match(html, /tramos sin datos no se suman/);
});
test('offline trip persistence roundtrips the numeric gap marker without changing the JSONB contract', async () => {
  const navigator = { onLine: false }, store = offlineStore({ navigator });
  const cached = { vehicles: [{ id: 7 }], activeVehicleId: 7, vehicle: { id: 7 }, trips: [] };
  const memory = new Map([['autoram.account.cache.v1', JSON.stringify({ userId: 'qa', account: cached })]]);
  const api = evaluate('lib/supabase-browser.ts', id => id.includes('supabase-js') ? { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'qa' } } }, error: null }) }, from() { throw new Error('unexpected network'); } }) } : id.includes('errors') ? errors : store, {
    navigator, localStorage: { getItem: key => memory.get(key) || null, setItem: (key, v) => memory.set(key, v) }, window: { location: { origin: 'https://autoram.test' } }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } },
  });
  const result = await api.autoramFetch('/api/autoram', { method: 'POST', body: JSON.stringify({ action: 'addTrip', data: { vehicleId: 7, routePoints: points, distanceKm: 0.222, startedAt: '2026-10-25T12:00:00Z', endedAt: '2026-10-25T12:02:00Z', durationSeconds: 120 } }) });
  assert.equal(result.status, 201); assert.equal((await result.json()).queued, true);
  const reloaded = await (await api.autoramFetch('/api/autoram')).json();
  assert.deepEqual(reloaded.trips[0].routePoints, points); assert.equal(reloaded.trips[0].distanceKm, 0.222);
});
