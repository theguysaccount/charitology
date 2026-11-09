import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewExclusiveResourceCapacity as review, validateExclusiveResourceInterval as interval,
  validateHistoricalExclusiveResourceInterval as historicalInterval,
  ResourceReservationError, EXCLUSIVE_RESOURCE_LIMITS } from '../lib/resource-reservation-model.mjs';

const range = (start = '09:00:00.000', end = '10:00:00.000') => ({
  startAt: `2026-12-03T${start}Z`, endAt: `2026-12-03T${end}Z`, timeZone: 'UTC' });
const held = (overrides = {}) => ({ id: 'hold1', assetId: 'asset1', occurrenceId: 'session1',
  originMode: 'live', state: 'reserved', interval: range(), ...overrides });
const input = (overrides = {}) => ({ capacity: 1,
  candidate: { assetId: 'asset1', occurrenceId: 'session2', interval: range('10:00:00.000', '11:00:00.000') },
  reservations: [], replacingReservationId: null, ...overrides });
const rejects = (fn, code) => assert.throws(fn, error => error instanceof ResourceReservationError && (!code || error.code === code));

test('empty capacity-one review is detached data, with no mutation or command fields', () => {
  const value = input(), before = structuredClone(value), result = review(value);
  assert.deepEqual(result, { state: 'ready', capacity: 1, replacingReservationId: null });
  assert(Object.isFrozen(result)); assert.deepEqual(value, before);
});
test('adjacent holds share an instant without overlapping, even in the reverse direction', () => {
  assert.equal(review(input({ reservations: [held()] })).state, 'ready');
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'session0', interval: range('08:00:00.000', '09:00:00.000') },
    reservations: [held()] })).state, 'ready');
});
test('one millisecond of overlap is a conflict across distinct sessions', () => {
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'session2', interval: range('09:59:59.999', '11:00:00.000') },
    reservations: [held()] })).state, 'conflict');
});
test('containing and contained intervals both conflict', () => {
  for (const r of [range('08:00:00.000', '11:00:00.000'), range('09:15:00.000', '09:45:00.000')])
    assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'other', interval: r }, reservations: [held()] })).state, 'conflict');
});
test('an occurrence may use a different asset without consuming this asset', () => {
  assert.equal(review(input({ candidate: { assetId: 'asset2', occurrenceId: 'session1', interval: range() }, reservations: [held()] })).state, 'ready');
});
test('a second hold for one asset/session pair conflicts even when its asserted times differ', () => {
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'session1', interval: range('12:00:00.000', '13:00:00.000') }, reservations: [held()] })).state, 'conflict');
});
test('released live and recovered histories do not consume capacity', () => {
  for (const originMode of ['live', 'recovered'])
    assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'other', interval: range() },
      reservations: [held({ originMode, state: 'released' })] })).state, 'ready');
});
test('unresolved recovered reservation blocks the asset without becoming a live hold', () => {
  const past = { startAt: '2025-01-01T09:00:00Z', endAt: '2025-01-01T10:00:00Z', timeZone: 'UTC' };
  assert.equal(review(input({ reservations: [held({ originMode: 'recovered', interval: past })] })).state, 'recovery-required');
  assert.equal(review(input({ reservations: [held({ assetId: 'other', originMode: 'recovered', interval: past })] })).state, 'ready');
});
test('a deliberate replacement can exclude only its one existing live hold', () => {
  const previous = held(), before = structuredClone(previous);
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'replacement', interval: range('09:30:00.000', '10:30:00.000') },
    reservations: [previous], replacingReservationId: previous.id })).state, 'ready');
  assert.deepEqual(previous, before);
});
test('a conflicting replacement leaves the complete previous inventory untouched', () => {
  const reservations = [held(), held({ id: 'hold2', occurrenceId: 'session2', interval: range('10:00:00.000', '11:00:00.000') })];
  const before = structuredClone(reservations);
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'replacement', interval: range('09:30:00.000', '10:30:00.000') },
    reservations, replacingReservationId: 'hold1' })).state, 'conflict');
  assert.deepEqual(reservations, before);
});
test('replacement may select another asset while retaining the old hold in its review input', () => {
  assert.equal(review(input({ candidate: { assetId: 'asset2', occurrenceId: 'session2', interval: range() },
    reservations: [held()], replacingReservationId: 'hold1' })).state, 'ready');
});
test('unchanged replacement is explicit and creates no new ready plan', () => {
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'session1', interval: range() }, reservations: [held()], replacingReservationId: 'hold1' })).state, 'unchanged');
});
test('replacement cannot name missing, released or recovered history', () => {
  for (const reservations of [[], [held({ state: 'released' })], [held({ originMode: 'recovered' })]])
    rejects(() => review(input({ reservations, replacingReservationId: 'hold1' })), 'resource_reservation_replacement');
});
test('unknown, zero, noninteger and multi-unit capacities cannot become unlimited', () => {
  for (const capacity of [null, 0, 2, -1, 1.1, '1', undefined])
    rejects(() => review(input({ capacity })), 'resource_reservation_known_capacity');
});
test('empty, inverted, invalid and offset-zone mismatched schedules refuse', () => {
  for (const r of [range('10:00:00.000', '10:00:00.000'), range('11:00:00.000', '10:00:00.000'),
    { ...range(), startAt: '2026-02-30T09:00:00Z' }, { ...range(), timeZone: 'Not/AZone' },
    { startAt: '2026-12-03T09:00:00-05:00', endAt: '2026-12-03T10:00:00-05:00', timeZone: 'UTC' }])
    rejects(() => interval(r), 'resource_reservation_interval');
});
test('overnight intervals preserve their exact written endpoints', () => {
  const r = { startAt: '2026-12-03T23:00:00Z', endAt: '2026-12-04T01:00:00Z', timeZone: 'UTC' };
  const admitted = interval(r); assert.deepEqual(admitted, r); assert.notEqual(admitted, r); assert(Object.isFrozen(admitted));
});
test('repeated local clock times remain distinct instants with explicit valid offsets', () => {
  const first = { startAt: '2026-11-01T01:00:00-04:00', endAt: '2026-11-01T01:30:00-04:00', timeZone: 'America/New_York' };
  const second = { startAt: '2026-11-01T01:00:00-05:00', endAt: '2026-11-01T01:30:00-05:00', timeZone: 'America/New_York' };
  assert.equal(review(input({ candidate: { assetId: 'asset1', occurrenceId: 'session2', interval: second }, reservations: [held({ interval: first })] })).state, 'ready');
});
test('duplicate IDs, duplicate live asset/session pairs and existing live overlaps require reconciliation', () => {
  for (const reservations of [[held(), held({ assetId: 'asset2' })],
    [held(), held({ id: 'other', interval: range('10:00:00.000', '11:00:00.000') })],
    [held(), held({ id: 'other', occurrenceId: 'other', interval: range('09:30:00.000', '10:30:00.000') })]])
    rejects(() => review(input({ reservations })), 'resource_reservation_inventory');
});
test('closed shapes reject extra fields, aliases, holes and malformed history', () => {
  for (const value of [input({ extra: true }), input({ candidate: { ...input().candidate, kind: 'session' } }),
    input({ reservations: [held({ state: 'unknown' })] }), input({ reservations: new Array(1) }),
    input({ reservations: Object.assign([], { extra: true }) })]) rejects(() => review(value));
});
test('accessors and proxies are rejected without invoking user code', () => {
  let calls = 0;
  const value = input(); Object.defineProperty(value, 'candidate', { enumerable: true, get() { calls++; throw new Error('called'); } });
  rejects(() => review(value));
  const nested = range(); Object.defineProperty(nested, 'startAt', { enumerable: true, get() { calls++; throw new Error('called'); } });
  rejects(() => interval(nested));
  const proxy = new Proxy(input(), { ownKeys() { calls++; throw new Error('called'); } });
  rejects(() => review(proxy)); assert.equal(calls, 0);
});
test('a non-string named zone is rejected before the shared helper can coerce it', () => {
  let calls = 0;
  const zone = { toString() { calls++; return 'UTC'; } };
  rejects(() => interval({ ...range(), timeZone: zone }), 'resource_reservation_interval');
  assert.equal(calls, 0);
});
test('the complete retained row boundary is separate from active occupancy', () => {
  const reservations = Array.from({ length: EXCLUSIVE_RESOURCE_LIMITS.reservations }, (_, i) => held({ id: `history_${i}`, state: 'released' }));
  assert.equal(review(input({ reservations })).state, 'ready');
  rejects(() => review(input({ reservations: [...reservations, held({ id: 'overflow', state: 'released' })] })), 'resource_reservation_limit');
});
test('the review reads no current wall clock and manufactures no source approval', () => {
  const saved = Date.now; Date.now = () => { throw new Error('wall clock read'); };
  try { assert.equal(review(input()).state, 'ready'); } finally { Date.now = saved; }
});
test('a no-longer-supported historical zone does not block an unrelated valid new candidate', () => {
  const previous = Intl.DateTimeFormat; let historicalCalls = 0;
  Intl.DateTimeFormat = function (locale, options) {
    if (options?.timeZone === 'Archive/Retired') { historicalCalls++; throw new RangeError('simulated removed zone'); }
    return new previous(locale, options);
  };
  try {
    const recorded = { ...range(), timeZone: 'Archive/Retired' };
    for (const originMode of ['live', 'recovered']) for (const state of ['reserved', 'released'])
      assert.equal(review(input({ reservations: [held({ assetId: 'other', originMode, state, interval: recorded })] })).state, 'ready');
    assert.equal(historicalCalls, 0);
    rejects(() => interval(recorded), 'resource_reservation_interval');
    assert.equal(historicalCalls, 1);
  } finally { Intl.DateTimeFormat = previous; }
});
test('changed current zone interpretation preserves frozen literal offsets but still governs new candidates', () => {
  const previous = Intl.DateTimeFormat; let historicalCalls = 0;
  Intl.DateTimeFormat = function (locale, options) {
    if (options?.timeZone === 'America/New_York') {
      historicalCalls++;
      // Simulated later rules: use UTC civil parts for the recorded zone.
      return new previous(locale, { ...options, timeZone: 'UTC' });
    }
    return new previous(locale, options);
  };
  try {
    const recorded = { startAt: '2026-11-01T01:00:00-04:00', endAt: '2026-11-01T01:30:00-04:00', timeZone: 'America/New_York' };
    for (const originMode of ['live', 'recovered']) for (const state of ['reserved', 'released'])
      assert.equal(review(input({ reservations: [held({ assetId: 'other', originMode, state, interval: recorded })] })).state, 'ready');
    assert.equal(historicalCalls, 0);
    rejects(() => interval(recorded), 'resource_reservation_interval');
    assert(historicalCalls > 0);
    assert.deepEqual(interval({ ...range(), timeZone: 'America/New_York' }), { ...range(), timeZone: 'America/New_York' });
  } finally { Intl.DateTimeFormat = previous; }
});
test('historical syntax retains exact offset/zone text while detaching it without zone authority', () => {
  const recorded = { startAt: '2026-11-01T01:00:00.001-04:00', endAt: '2026-11-01T01:30:00.123-04:00', timeZone: 'Archive/Retired' };
  const admitted = historicalInterval(recorded);
  assert.deepEqual(admitted, recorded); assert.notEqual(admitted, recorded); assert(Object.isFrozen(admitted));
});
test('malformed historical instants, literal zone text and accessor shapes still refuse', () => {
  for (const recorded of [{ ...range(), startAt: '2026-02-30T09:00:00Z' }, range('10:00:00.000', '09:00:00.000'),
    range('10:00:00.000', '10:00:00.000'), ...['', 'UTC\n', '+05', '-03', 'A'.repeat(101), 'A B', '<UTC>'].map(timeZone => ({ ...range(), timeZone }))]) {
    rejects(() => historicalInterval(recorded), 'resource_reservation_interval');
    rejects(() => review(input({ reservations: [held({ assetId: 'other', state: 'released', interval: recorded })] })), 'resource_reservation_interval');
  }
  let calls = 0;
  const zone = { toString() { calls++; return 'UTC'; } };
  rejects(() => historicalInterval({ ...range(), timeZone: zone }));
  const recorded = range(); Object.defineProperty(recorded, 'startAt', { enumerable: true, get() { calls++; throw new Error('called'); } });
  rejects(() => historicalInterval(recorded)); assert.equal(calls, 0);
});
test('all candidate, retained and replacement selectors admit exactly 100 valid ASCII characters', () => {
  const previous = held({ id: 'R9_-'.repeat(25), assetId: 'H9_-'.repeat(25), occurrenceId: 'S9_-'.repeat(25) });
  const value = input({ candidate: { assetId: 'A9_-'.repeat(25), occurrenceId: 'B9_-'.repeat(25), interval: range() },
    reservations: [previous], replacingReservationId: previous.id });
  assert.equal(review(value).state, 'ready');
});
test('every selector rejects line terminators, non-ASCII, empty, 101-character and non-string values without coercion', () => {
  const selectors = [
    value => input({ candidate: { ...input().candidate, assetId: value } }),
    value => input({ candidate: { ...input().candidate, occurrenceId: value } }),
    value => input({ reservations: [held({ id: value })] }),
    value => input({ reservations: [held({ assetId: value })] }),
    value => input({ reservations: [held({ occurrenceId: value })] }),
    value => input({ reservations: [held()], replacingReservationId: value }),
  ];
  let coercions = 0;
  const object = { toString() { coercions++; return 'hold1'; } };
  for (const invalid of ['value\n', 'value\r', 'value\u2028', 'value\u2029', 'value\r\n', 'é', 'a b', '',
    'A'.repeat(101), 1, new String('hold1'), object])
    for (const select of selectors) rejects(() => review(select(invalid)), 'resource_reservation_shape');
  assert.equal(coercions, 0);
});
