/* CommonJS is used by the Node regression test runner. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./helpers.cjs');
const pmtiles = require('pmtiles');
const fixture = require('./map-fixture.cjs');
const map = evaluate('lib/canvas-map.ts', path => require(path));
test('lightweight map projection places a selected point back at the same coordinates', () => {
  const point = [-73.635, 4.105];
  const pixel = map.worldPoint(...point, 15);
  const decoded = map.worldLocation(...pixel, 15);
  assert.ok(Math.abs(decoded[0] - point[0]) < 1e-8);
  assert.ok(Math.abs(decoded[1] - point[1]) < 1e-8);
});
test('lightweight map draws real offline streets and their names without WebGL or fetching', async () => {
  let fills = 0, strokes = 0;
  const context = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() { fills++; }, stroke() { strokes++; } };
  const archive = new pmtiles.PMTiles(new pmtiles.FileSource(new File([fixture], 'map-fixture')));
  const z = 15, x = Math.floor(((-73.635 + 180) / 360) * 2 ** z), rad = 4.105 * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z);
  const tile = await archive.getZxy(z, x, y);
  const labels = map.paintVectorTile(context, tile.data, 0, 0, 256, z, false);
  assert.ok(fills > 0);
  assert.ok(strokes > 0);
  assert.ok(labels.some(label => /Calle|Carrera/.test(label.text)));
});
