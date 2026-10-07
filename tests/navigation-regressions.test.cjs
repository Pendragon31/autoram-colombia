/* CommonJS is used by the Node regression test runner. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./helpers.cjs');
const geo = evaluate('lib/geo.ts', () => {});
function navigation(globals = {}) { return evaluate('lib/navigation.ts', () => geo, { navigator: { onLine: true }, ...globals }); }
const nav = navigation();
const step = (type, modifier, exit) => ({ name: 'Calle 10', distance: 50, maneuver: { type, modifier, exit, location: [-73.63, 4.10] }, geometry: { coordinates: [] } });
test('Spanish guidance handles turns, roundabouts, returns and arrival', () => {
  assert.equal(nav.turnInstruction(step('turn', 'right')), 'Gira a la derecha por Calle 10');
  assert.equal(nav.turnInstruction(step('roundabout', 'right', 3)), 'En la glorieta, toma la salida 3 por Calle 10');
  assert.equal(nav.turnInstruction(step('turn', 'uturn')), 'Haz un retorno por Calle 10');
  assert.equal(nav.turnInstruction(step('arrive')), 'Llegaste a tu destino');
});
test('GPS projection measures progress along a segment, not distance to destination', () => {
  const coordinates = [[-73.64, 4.10], [-73.63, 4.10], [-73.63, 4.11]];
  const distances = nav.cumulativeDistances(coordinates);
  const result = nav.projectRoute(coordinates, distances, { lng: -73.635, lat: 4.10 });
  assert.ok(Math.abs(result.alongM - distances[1] / 2) < 1);
  assert.ok(result.awayM < 1);
  const away = nav.projectRoute(coordinates, distances, { lng: -73.635, lat: 4.102 });
  assert.ok(away.awayM > 200);
});
test('progress window keeps a crossing from skipping a later loop', () => {
  const coordinates = [[-73.64, 4.10], [-73.63, 4.10], [-73.63, 4.11], [-73.64, 4.11], [-73.64, 4.10], [-73.63, 4.10]];
  const distances = nav.cumulativeDistances(coordinates);
  const result = nav.projectRoute(coordinates, distances, { lng: -73.635, lat: 4.10 }, 200, 900);
  assert.ok(result.alongM < 1000);
});
test('remaining time and next turn advance with route progress', () => {
  const coordinates = [[-73.64, 4.10], [-73.63, 4.10], [-73.63, 4.11]];
  const distances = nav.cumulativeDistances(coordinates);
  const route = { coordinates, distanceM: distances.at(-1), durationS: 600, steps: [{ type: 'depart', alongM: 0 }, { type: 'turn', alongM: distances[1] }, { type: 'arrive', alongM: distances[2] }] };
  const guide = nav.guidanceAt(route, 500);
  assert.equal(guide.next.type, 'turn');
  assert.ok(guide.nextInM > 500 && guide.nextInM < 700);
  assert.ok(guide.remainingS < 600);
  assert.equal(nav.guidanceAt(route, distances.at(-1) - 10).arrived, true);
});
test('offline planning never requests a new road route or invents a straight line', async () => {
  let calls = 0;
  const offline = navigation({ navigator: { onLine: false }, fetch: async () => { calls++; } });
  await assert.rejects(offline.requestRoute({ lat: 4.10, lng: -73.64 }, { lat: 4.11, lng: -73.63 }, 'Destino', new AbortController().signal), /internet/);
  assert.equal(calls, 0);
});
test('route cache is isolated by owner and ignores corrupt coordinates', () => {
  const records = new Map();
  const localStorage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
  const navigationModule = navigation({ localStorage });
  const route = { version: 1, destinationName: 'Parque', createdAt: Date.now(), distanceM: 1000, durationS: 300, coordinates: [[-73.64, 4.10], [-73.63, 4.10]], steps: [{ instruction: 'Llegaste a tu destino', location: [-73.63, 4.10], alongM: 1000, type: 'arrive' }] };
  assert.equal(navigationModule.savePlannedRoute('alice', route), true);
  assert.equal(navigationModule.loadPlannedRoute('bob'), null);
  assert.equal(navigationModule.loadPlannedRoute('alice').destinationName, 'Parque');
  route.coordinates[0][1] = 100;
  navigationModule.savePlannedRoute('alice', route);
  assert.equal(navigationModule.loadPlannedRoute('alice'), null);
});
test('unroutable online response is reported without changing cached route', async () => {
  const navigationModule = navigation({ fetch: async () => new Response(JSON.stringify({ code: 'NoRoute', routes: [] })) });
  await assert.rejects(navigationModule.requestRoute({ lat: 4.10, lng: -73.64 }, { lat: 4.11, lng: -73.63 }, 'Destino', new AbortController().signal), /carretera/);
});
