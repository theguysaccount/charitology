import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { participationTimestampParameter as parameter } from '../lib/participation-timestamp.mjs';
const cases = ['2026-10-27T00:00:00.000Z', '+100000-12-31T23:59:59.999Z', '-000001-12-31T23:59:59.999Z', '0000-01-01T00:00:00.000Z'];
test('UTC PostgreSQL transport keeps canonical source values and translates astronomical years exactly', () => {
  assert.equal(parameter(cases[0]), cases[0]); assert.equal(parameter(cases[1]), '100000-12-31T23:59:59.999Z');
  assert.equal(parameter(cases[2]), '0002-12-31T23:59:59.999Z BC'); assert.equal(parameter(cases[3]), '0001-01-01T00:00:00.000Z BC');
  for (const value of cases) assert.equal(parameter(new Date(value)), parameter(value));
  assert.equal(parameter(null), null); assert.equal(parameter(undefined), null);
  assert.equal(parameter('2200-12-31T23:59:59.999999Z'), '2200-12-31T23:59:59.999999Z');
});
test('transport is identical across UTC and historical second-offset host time zones', () => {
  const module = new URL('../lib/participation-timestamp.mjs', import.meta.url).href;
  const code = `import {participationTimestampParameter as p} from ${JSON.stringify(module)};process.stdout.write(JSON.stringify(${JSON.stringify(cases)}.map(v=>[p(v),p(new Date(v))])));`;
  const expected = JSON.stringify(cases.map(value => [parameter(value), parameter(value)]));
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Europe/Amsterdam']) {
    const actual = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(actual, expected, TZ);
  }
});
