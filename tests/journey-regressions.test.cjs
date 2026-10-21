/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests use CommonJS. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./helpers.cjs');
const summary = evaluate('lib/journey-summary.ts', () => {});
const { summarizeJourney, journeyBounds, mergeJourneyRecords } = summary;
const { fetchJourneyRecords } = evaluate('lib/journey-data.ts', () => summary);
const now = new Date('2026-10-21T17:00:00Z');
const empty = () => ({ sessions: [], fuelRecords: [], maintenanceRecords: [], trips: [] });
test('today starts at Colombian midnight and includes an overnight shift closed today', () => {
  const records = empty();
  records.sessions = [{ id: 1, startedAt: '2026-10-21T03:00:00Z', endedAt: '2026-10-21T05:00:00Z', income: 100000, expenses: 15000 }, { id: 2, endedAt: '2026-10-21T04:59:59Z', income: 50000, expenses: 0 }];
  records.fuelRecords = [{ occurredAt: '2026-10-21T05:00:00Z', total: 25000 }, { occurredAt: '2026-10-21T04:59:59Z', total: 7000 }];
  const totals = summarizeJourney(records, 'today', now);
  assert.equal(new Date(journeyBounds('today', now).start).toISOString(), '2026-10-21T05:00:00.000Z');
  assert.equal(totals.income, 100000); assert.equal(totals.expenses, 40000); assert.equal(totals.net, 60000); assert.equal(totals.closedCount, 1);
});
test('seven and thirty-one day windows include their first day and exclude older entries', () => {
  const records = empty(); records.maintenanceRecords = [
    { occurredAt: '2026-10-15T04:59:59Z', total: 100 }, { occurredAt: '2026-10-15T05:00:00Z', total: 200 },
    { occurredAt: '2026-09-21T05:00:00Z', total: 300 }, { occurredAt: '2026-09-21T04:59:59Z', total: 400 },
  ];
  assert.equal(summarizeJourney(records, 'week', now).maintenanceCost, 200);
  assert.equal(summarizeJourney(records, 'month', now).maintenanceCost, 600);
});
test('open shifts, future dates and invalid timestamps never become earned income', () => {
  const records = empty(); records.sessions = [{ endedAt: null, income: 99999, expenses: 20 }, { endedAt: '2026-10-22T12:00:00Z', income: 99, expenses: 0 }, { endedAt: 'bad-date', income: 9, expenses: 0 }];
  assert.equal(summarizeJourney(records, 'today', now).income, 0);
  assert.equal(summarizeJourney(records, 'today', now).hasRecords, false);
});
test('costs without income produce a loss, and invalid amounts cannot poison the balance', () => {
  const records = empty(); records.fuelRecords = [{ occurredAt: now.toISOString(), total: 25000 }, { occurredAt: now.toISOString(), total: NaN }];
  records.trips = [{ endedAt: now.toISOString(), distanceKm: 12 }, { endedAt: now.toISOString(), distanceKm: Infinity }];
  const totals = summarizeJourney(records, 'today', now);
  assert.equal(totals.net, -25000); assert.equal(totals.distance, 12);
});
test('pending local closures are included and confirmed server IDs are never duplicated', () => {
  const remote = empty(), local = empty();
  remote.sessions = [{ id: 7, endedAt: now.toISOString(), income: 100, expenses: 10 }];
  local.sessions = [{ id: 7, endedAt: now.toISOString(), income: 99, expenses: 99 }, { id: 8, endedAt: now.toISOString(), income: 150, expenses: 20 }];
  remote.fuelRecords = [{ id: 12, occurredAt: now.toISOString(), total: 30 }];
  local.fuelRecords = [{ id: 12, occurredAt: now.toISOString(), total: 30 }, { id: -1, occurredAt: now.toISOString(), total: 5 }];
  const totals = summarizeJourney(mergeJourneyRecords(remote, local), 'today', now);
  assert.equal(totals.closedCount, 2); assert.equal(totals.net, 185); assert.equal(totals.fuelCount, 2);
});
function fakeClient({ fail = false, rows = 501, cap = 500 } = {}) {
  const calls = [];
  return { calls, from(table) {
    const c = { table }; calls.push(c);
    const q = { select(columns) { c.columns = columns; return q; }, eq(k, v) { c.eq = [k, v]; return q; }, gte(k, v) { c.gte = [k, v]; return q; }, lte(k, v) { c.lte = [k, v]; return q; }, order(k, v) { c.order = [k, v]; return q; }, range(a, b) { c.range = [a, b]; return q; }, async abortSignal(signal) { c.signal = signal; return fail ? { data: null, error: { message: 'network' } } : { error: null, count: rows, data: Array.from({ length: Math.min(cap, Math.max(0, rows - c.range[0])) }, (_, i) => ({ id: i + c.range[0] + 1, ended_at: now.toISOString(), occurred_at: now.toISOString(), income: 10, expenses: 1, total: 2, distance_km: 3 })) }; } };
    return q;
  } };
}
test('reads every page of the selected period and scopes all requests to the active vehicle', async () => {
  const client = fakeClient(), signal = new AbortController().signal;
  const records = await fetchJourneyRecords(client, 27, 'today', now, signal);
  assert.equal(records.sessions.length, 501); assert.equal(records.fuelRecords.length, 501); assert.equal(records.trips.length, 501);
  assert.equal(client.calls.length, 8);
  for (const c of client.calls) { assert.deepEqual(c.eq, ['vehicle_id', 27]); assert.equal(c.gte[1], '2026-10-21T05:00:00.000Z'); assert.equal(c.lte[1], now.toISOString()); assert.equal(c.order[0], 'id'); assert.equal(c.signal, signal); }
  assert.equal(summarizeJourney(records, 'today', now).income, 5010);
});
test('an interrupted or failed page never returns a seemingly complete partial balance', async () => {
  const controller = new AbortController(); controller.abort(); const client = fakeClient();
  await assert.rejects(fetchJourneyRecords(client, 27, 'today', now, controller.signal), /cancelada/); assert.equal(client.calls.length, 0);
  await assert.rejects(fetchJourneyRecords(fakeClient({ fail: true }), 27, 'today', now, new AbortController().signal), /actualizar/);
});
test('invalid vehicle IDs are rejected before any financial query runs', async () => {
  const client = fakeClient();
  for (const id of [0, -1, NaN, 1.5]) await assert.rejects(fetchJourneyRecords(client, id, 'today', now, new AbortController().signal), /vehículo/);
  assert.equal(client.calls.length, 0);
});

test('a server row cap smaller than the requested page never truncates the period', async () => {
  const records = await fetchJourneyRecords(fakeClient({ rows: 123, cap: 50 }), 27, 'today', now, new AbortController().signal);
  assert.equal(records.sessions.length, 123); assert.equal(records.trips.length, 123);
});

test('the weekly chart reconciles with the seven day balance and assigns overnight income to closing day', () => {
  const records = empty(); records.sessions = [{ id: 1, endedAt: '2026-10-21T05:00:00Z', income: 100, expenses: 20 }, { id: 2, endedAt: '2026-10-20T04:59:00Z', income: 50, expenses: 5 }];
  records.fuelRecords = [{ id: 1, occurredAt: '2026-10-21T07:00:00Z', total: 30 }];
  const week = summary.journeyWeek(records, now), totals = summarizeJourney(records, 'week', now);
  assert.equal(week.reduce((sum, day) => sum + day.income, 0), totals.income);
  assert.equal(week.reduce((sum, day) => sum + day.expenses, 0), totals.expenses);
  assert.equal(week[6].income, 100); assert.equal(week[6].expenses, 50);
});
