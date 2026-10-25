/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use CommonJS. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { evaluate } = require('./helpers.cjs');
const root = path.join(__dirname, '..');
function compile(source, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: imports, console, ...globals });
  return exports;
}
const TripFeedback = compile(fs.readFileSync(path.join(root, 'components/trip-feedback.tsx'), 'utf8'), require).default;
// Render the actual navigation screen, not a copy of its feedback condition.
const pageSource = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
const screenSource = pageSource.slice(pageSource.indexOf('function NavigatePage('), pageSource.indexOf('function MaintenancePage('));
const empty = () => null;
const NavigatePage = compile(screenSource + '\nexports.NavigatePage = NavigatePage;', require, {
  useState: React.useState, TripFeedback, TripMap: empty, NavigationPanel: empty,
  PageTitle: empty, ConnectionBadge: empty, LocationShare: empty, Metric: empty, Title: empty,
  AlertTriangle: empty, Navigation: empty, LocateFixed: empty, Map: empty, X: empty,
  ChevronRight: empty, Route: empty, Gauge: empty, TimerReset: empty,
  formatDuration: seconds => String(seconds),
}).NavigatePage;
function render(tracker) {
  return renderToStaticMarkup(React.createElement(NavigatePage, { userId: 'qa', tracker, records: [], saveTrip: async () => {} }));
}
const geo = evaluate('lib/geo.ts', () => {});
function trackerHarness({ supported = true, draft = null } = {}) {
  const slots = [], memory = new Map(); let cursor = 0, onPosition, onError, clears = 0;
  if (draft) memory.set('autoram.trip.draft.v1', JSON.stringify(draft));
  const react = {
    useState(initial) { const slot = cursor++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }]; },
    useRef(initial) { const slot = cursor++; return slots[slot] ||= { current: initial }; },
    useCallback: fn => fn, useEffect() {},
  };
  const intervals = new Set(); let nextTimer = 0;
  const navigator = supported ? { geolocation: { watchPosition(position, error) { onPosition = position; onError = error; return 7; }, clearWatch() { clears++; } } } : {};
  const hook = evaluate('hooks/use-trip-tracker.ts', id => id === 'react' ? react : id.includes('offline-queue') ? { newClientId: () => 'qa-trip' } : geo, {
    navigator, localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) },
    window: { setInterval: () => { const id = ++nextTimer; intervals.add(id); return id; }, clearInterval: id => intervals.delete(id) },
  }).useTripTracker;
  return {
    snapshot() { cursor = 0; return hook({ vehicleId: 7 }); },
    error(code) { onError({ code }); },
    position(latitude, longitude, timestamp = Date.now()) { onPosition({ coords: { latitude, longitude, accuracy: 5, speed: 0 }, timestamp }); },
    intervals, memory, get clears() { return clears; },
  };
}
test('denied GPS before the first point shows actionable feedback even without a map or draft', () => {
  const env = trackerHarness(); env.snapshot().start(); env.error(1);
  const tracker = env.snapshot(), html = render(tracker);
  assert.equal(tracker.state, 'error'); assert.equal(tracker.points.length, 0);
  assert.match(html, /role="alert"/); assert.match(html, /ubicación está bloqueada/);
  assert.match(html, /ajustes de este sitio/); assert.match(html, /ubicación del teléfono/);
  assert.match(html, /Registrar sin destino/); assert.doesNotMatch(html, /nav-map-stage/);
  assert.equal(env.clears, 1); assert.equal(env.intervals.size, 0);
  tracker.start(); assert.equal(env.snapshot().state, 'locating');
});
test('unsupported geolocation shows an alert before any point exists', () => {
  const env = trackerHarness({ supported: false }); env.snapshot().start();
  const html = render(env.snapshot());
  assert.match(html, /role="alert"/); assert.match(html, /Este dispositivo no permite usar GPS/);
});
test('a first-fix timeout stays visible while the GPS observer keeps trying, then clears on a fix', () => {
  const env = trackerHarness(); env.snapshot().start(); env.error(3);
  let html = render(env.snapshot());
  assert.match(html, /role="status"/); assert.match(html, /GPS tarda en responder/);
  assert.equal(env.snapshot().state, 'locating'); assert.equal(env.clears, 0); assert.equal(env.intervals.size, 1);
  env.position(4.15, -73.63);
  html = render(env.snapshot()); assert.doesNotMatch(html, /GPS tarda en responder/);
  assert.equal(env.snapshot().state, 'tracking');
});
test('denial while resuming preserves the draft and keeps the error beside Retomar', () => {
  const env = trackerHarness({ draft: { vehicleId: 7, clientId: 'qa-existing', startedAt: new Date().toISOString(), points: [[4.15, -73.63, Date.now() - 60000], [4.151, -73.63, Date.now()]] } });
  env.snapshot().resume(); env.error(1);
  const tracker = env.snapshot(), html = render(tracker);
  assert.equal(tracker.hasDraft, true); assert.match(html, /Retomar/); assert.match(html, /role="alert"/);
  assert.match(html, /ubicación está bloqueada/);
  assert.equal(JSON.parse(env.memory.get('autoram.trip.draft.v1')).clientId, 'qa-existing');
});
test('stationary accurate GPS fixes clear a prior temporary signal warning', () => {
  const env = trackerHarness(); env.snapshot().start(); env.position(4.15, -73.63);
  env.error(2); assert.match(env.snapshot().message, /No hay señal/);
  env.position(4.15, -73.63, Date.now() + 1000);
  assert.equal(env.snapshot().message, ''); assert.equal(env.snapshot().points.length, 1);
});
test('a completed empty trip keeps its explanation visible after its map closes', () => {
  const env = trackerHarness(); env.snapshot().start(); assert.equal(env.snapshot().stop(), null);
  const html = render(env.snapshot());
  assert.doesNotMatch(html, /nav-map-stage/); assert.match(html, /El recorrido no registró distancia/);
});
test('a saved trip confirmation remains visible with no active map or points', () => {
  const env = trackerHarness(); env.snapshot().finish(true, 'Guardado en el teléfono. Se enviará cuando haya señal.');
  const html = render(env.snapshot());
  assert.match(html, /role="status"/); assert.match(html, /Guardado en el teléfono/);
  assert.doesNotMatch(html, /nav-map-stage/);
});
test('an idle GPS with no message renders no empty alert', () => {
  const env = trackerHarness(); assert.doesNotMatch(render(env.snapshot()), /trip-feedback|role="alert"/);
});
