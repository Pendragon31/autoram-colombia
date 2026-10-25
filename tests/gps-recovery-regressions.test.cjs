/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gpsHarness } = require('./gps-harness.cjs');
test('signal status distinguishes estimated accuracy, stale fixes and an idle GPS', () => {
  const h = gpsHarness(), { gpsSignal } = h.signal;
  assert.equal(gpsSignal('tracking', 5, h.now, h.now).label, 'Señal buena');
  assert.equal(gpsSignal('tracking', 40, h.now, h.now).label, 'Señal aceptable');
  assert.equal(gpsSignal('locating', 80, null, h.now).label, 'Precisión baja');
  assert.equal(gpsSignal('tracking', 5, h.now - 30000, h.now).label, 'Sin ubicación reciente');
  assert.equal(gpsSignal('idle', 5, h.now, h.now).label, 'GPS en espera');
});
test('stationary valid readings refresh the fix age without adding jitter or distance', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position(); const first = h.snapshot().lastFixAt;
  h.advance(20000); h.position();
  const tracker = h.snapshot(); assert.equal(tracker.points.length, 1); assert.equal(tracker.distanceKm, 0);
  assert.equal(tracker.lastFixAt - first, 20000); assert.equal(tracker.signal.ageSeconds, 0); assert.equal(tracker.signal.label, 'Señal buena');
});
test('old, future, impossible and nonfinite positions never become a valid fix', () => {
  const h = gpsHarness(); h.snapshot().start();
  for (const data of [{ lat: 100, lng: 0 }, { lat: NaN, lng: 0 }, { lat: 4, lng: Infinity }, { lat: 4, lng: -73, accuracy: 0 }, { lat: 4, lng: -73, timestamp: h.now - 16000 }, { lat: 4, lng: -73, timestamp: h.now + 6000 }]) h.position(data.lat, data.lng, data);
  assert.equal(h.snapshot().points.length, 0); assert.equal(h.snapshot().lastFixAt, null); assert.equal(h.snapshot().distanceKm, 0);
});
test('out-of-order and repeated fixes are ignored', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position();
  h.position(4.151, -73.63); h.position(4.151, -73.63, { timestamp: h.now - 1000 });
  assert.equal(h.snapshot().points.length, 1); assert.equal(h.snapshot().distanceKm, 0);
});
test('a low precision reading is shown but excluded from accepted points and mileage', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position(); const reliable = h.snapshot().lastFixAt;
  h.advance(1000); h.position(4.16, -73.63, { accuracy: 90 });
  const tracker = h.snapshot(); assert.equal(tracker.accuracyM, 90); assert.equal(tracker.signal.label, 'Precisión baja');
  assert.equal(tracker.lastFixAt, reliable); assert.equal(tracker.points.length, 1); assert.equal(tracker.distanceKm, 0);
});
test('watchdog restarts a silent observer at a bounded interval and ignores its late callbacks', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position(); h.advance(30000);
  assert.equal(h.starts, 2); assert.equal(h.activeWatchers.size, 1); assert.match(h.snapshot().message, /recuperar la señal/);
  h.position(4.3, -73.6, { watcher: 1 }); assert.equal(h.snapshot().points.length, 1);
  h.advance(10000); assert.equal(h.starts, 2);
});
test('the first position after a silent gap starts a segment without adding the unknown displacement', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position(); h.advance(31000); h.position(4.2, -73.63);
  let tracker = h.snapshot(); assert.equal(tracker.points.at(-1)[3], 1); assert.equal(tracker.distanceKm, 0); assert.equal(tracker.gapCount, 1);
  h.advance(10000); h.position(4.201, -73.63); tracker = h.snapshot();
  assert(tracker.distanceKm > 0.1 && tracker.distanceKm < 0.12);
  const saved = tracker.stop(); assert(saved); assert.equal(saved.routePoints.filter(p => p[3] === 1).length, 1);
  assert(saved.distanceKm < 0.12);
});
test('going to the background suspends GPS and returning preserves the trip identity and prior distance', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position(); h.advance(10000); h.position(4.151, -73.63);
  const startedAt = h.snapshot().startedAt, distance = h.snapshot().distanceKm;
  h.visibility('hidden'); assert.equal(h.activeWatchers.size, 0); assert.match(h.snapshot().message, /segundo plano/);
  h.advance(60000); h.visibility('visible'); assert.equal(h.activeWatchers.size, 1);
  assert.match(h.snapshot().message, /sin reiniciar/); h.position(4.2, -73.63);
  const tracker = h.snapshot(); assert.equal(tracker.startedAt, startedAt); assert.equal(tracker.distanceKm, distance);
  assert.equal(tracker.stop().clientId, 'qa-stable-trip-id');
});
test('pageshow recovery never duplicates observers, and stopped or denied trips do not resume', () => {
  const h = gpsHarness(); h.snapshot().start(); h.windowEvent('pageshow'); assert.equal(h.activeWatchers.size, 1);
  h.snapshot().stop(); const count = h.starts; h.windowEvent('pageshow'); h.visibility('visible'); assert.equal(h.starts, count);
  h.snapshot().start(); h.error(1); const deniedCount = h.starts; h.advance(60000); h.visibility('visible');
  assert.equal(h.starts, deniedCount); assert.equal(h.activeWatchers.size, 0);
});
test('a resumed segmented draft retains measured distance, gap markers and the original client id', () => {
  const base = Date.parse('2026-10-25T17:58:00Z');
  const draft = { vehicleId: 7, clientId: 'qa-prior-id', startedAt: new Date(base).toISOString(), points: [[4.15, -73.63, base], [4.151, -73.63, base + 10000], [4.2, -73.63, base + 50000, 1], [4.201, -73.63, base + 60000]] };
  const h = gpsHarness({ draft }); h.snapshot().resume(); const tracker = h.snapshot();
  assert(tracker.distanceKm > 0.21 && tracker.distanceKm < 0.23); assert.equal(tracker.gapCount, 1);
  h.position(4.3, -73.63); assert.equal(h.snapshot().distanceKm, tracker.distanceKm);
  assert.equal(h.snapshot().stop().clientId, 'qa-prior-id');
});
test('gap boundaries survive simplification, JSON persistence and both route geometry and length calculation', () => {
  const h = gpsHarness(), points = [[4.15, -73.63, 1], [4.151, -73.63, 10001], [4.2, -73.63, 50001, 1], [4.201, -73.63, 60001]];
  const restored = JSON.parse(JSON.stringify(h.geo.simplifyRoute(points, 1000)));
  assert.equal(restored.length, 4); assert.equal(h.geo.trackGeometry(restored).coordinates.length, 2);
  assert(h.geo.routeLengthKm(restored) < 0.23); assert.equal(h.geo.speedKmh(restored[1], restored[2]), 0);
});
test('legacy three-value drafts and routes continue to work', () => {
  const base = Date.parse('2026-10-25T17:59:00Z');
  const h = gpsHarness({ draft: { vehicleId: 7, startedAt: new Date(base).toISOString(), points: [[4.15, -73.63, base], [4.151, -73.63, base + 10000]] } });
  h.snapshot().resume(); assert(h.snapshot().distanceKm > 0.1); assert.equal(h.snapshot().gapCount, 0);
  assert.equal(h.geo.trackGeometry(h.snapshot().points).coordinates.length, 1);
});
test('unmount releases timers and observers, and delayed callbacks cannot append points', () => {
  const h = gpsHarness(); h.snapshot().start(); h.position(); h.snapshot(); h.unmount();
  assert.equal(h.activeWatchers.size, 0); assert.equal(h.timers.size, 0); h.position(4.2, -73.6);
  const draft = JSON.parse(h.memory.get(h.key)); assert.equal(draft.points.length, 1);
});
