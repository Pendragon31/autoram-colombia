/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness. */
const { evaluate } = require('./helpers.cjs');
function gpsHarness({ draft, supported = true, userId, vehicleId = 7 } = {}) {
  let clock = Date.parse('2026-10-25T18:00:00Z'), cursor = 0, timerId = 0, watcherId = 0;
  const slots = [], effects = [], timers = new Map(), watchers = new Map(), activeWatchers = new Set(), memory = new Map();
  const documentEvents = new Map(), windowEvents = new Map();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const equal = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const events = (target, store) => Object.assign(target, { addEventListener(name, fn) { if (!store.has(name)) store.set(name, new Set()); store.get(name).add(fn); }, removeEventListener(name, fn) { store.get(name)?.delete(fn); } });
  const schedule = (fn, ms, repeat) => { const id = ++timerId; timers.set(id, { fn, ms, repeat, next: clock + ms }); return id; };
  const document = events({ visibilityState: 'visible' }, documentEvents);
  const window = events({ setTimeout: (fn, ms) => schedule(fn, ms, false), clearTimeout: id => timers.delete(id), setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: id => timers.delete(id) }, windowEvents);
  const navigator = supported ? { geolocation: { watchPosition(position, error) { const id = ++watcherId; watchers.set(id, { position, error }); activeWatchers.add(id); return id; }, clearWatch(id) { activeWatchers.delete(id); } } } : {};
  const globals = { Date: Clock, navigator, document, window, localStorage: { getItem: key => memory.get(key) || null, setItem: (key, v) => memory.set(key, v), removeItem: key => memory.delete(key) } };
  const geo = evaluate('lib/geo.ts', () => {}, globals), signal = evaluate('lib/gps-signal.ts', () => {}, globals);
  const hook = evaluate('hooks/use-trip-tracker.ts', id => id === 'react' ? react : id.includes('gps-signal') ? signal : id.includes('offline-queue') ? { newClientId: () => 'qa-stable-trip-id' } : geo, globals).useTripTracker;
  const key = userId ? 'autoram.trip.draft.v1.' + userId + '.' + vehicleId : 'autoram.trip.draft.v1';
  if (draft) memory.set(key, JSON.stringify(draft));
  const snapshot = () => { cursor = 0; const result = hook({ vehicleId, userId }); while (effects.length) effects.shift()(); return result; };
  const advance = ms => {
    const end = clock + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.next <= end).sort((a, b) => a[1].next - b[1].next)[0];
      if (!next) break;
      const [id, timer] = next; clock = timer.next;
      if (timer.repeat) timer.next += timer.ms; else timers.delete(id);
      timer.fn();
    }
    clock = end;
  };
  snapshot(); advance(0); snapshot();
  return {
    snapshot, advance, memory, key, document, timers, activeWatchers, watchers, geo, signal,
    get now() { return clock; }, get starts() { return watcherId; },
    position(lat = 4.15, lng = -73.63, { accuracy = 5, timestamp = clock, speed = 0, watcher = watcherId } = {}) { watchers.get(watcher).position({ coords: { latitude: lat, longitude: lng, accuracy, speed }, timestamp }); },
    error(code, watcher = watcherId) { watchers.get(watcher).error({ code }); },
    visibility(value) { document.visibilityState = value; for (const fn of documentEvents.get('visibilitychange') || []) fn(); },
    windowEvent(name) { for (const fn of windowEvents.get(name) || []) fn(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
module.exports = { gpsHarness };
