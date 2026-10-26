import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { verifiedNeonConnectionString } from '../lib/connection.mjs';
test('Neon aliases become explicit certificate and hostname verification', () => {
  for (const mode of ['prefer', 'require', 'verify-ca', 'verify-full']) {
    const url = new URL(verifiedNeonConnectionString(`postgresql://test:test@ep-example-pooler.us-east-2.aws.neon.tech/db?sslmode=${mode}&channel_binding=require`));
    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    assert.equal(url.searchParams.get('channel_binding'), 'require');
    const parsed = new pg.Client({ connectionString: url.toString() }).connectionParameters;
    assert.ok(parsed.ssl && parsed.ssl.rejectUnauthorized !== false);
    assert.equal(parsed.ssl.checkServerIdentity, undefined, 'default Node hostname verification is preserved');
  }
});
test('Neon mode cannot be weakened by absent, duplicate or legacy compatibility parameters', () => {
  for (const query of ['', '?sslmode=require&sslmode=disable', '?ssl=0&sslmode=no-verify', '?sslmode=require&uselibpqcompat=true']) {
    const normalized = verifiedNeonConnectionString('postgres://test:test@ep-example.aws.neon.tech/db'+query);
    const url = new URL(normalized);
    assert.deepEqual(url.searchParams.getAll('sslmode'), ['verify-full']);
    const ssl = new pg.Client({ connectionString: normalized }).connectionParameters.ssl;
    assert.ok(ssl && ssl.rejectUnauthorized !== false);
    assert.equal(ssl.checkServerIdentity, undefined);
  }
});
test('Local CI and unrelated hosts are preserved byte for byte, including explicit no-SSL', () => {
  for (const value of ['postgres://test:test@127.0.0.1:5432/newsletter', 'postgres://test:test@localhost/db?sslmode=disable', 'postgres://test:test@ep.neon.tech.attacker.example/db?sslmode=require', 'postgres://test:test@notneon.tech/db', 'postgres://neon.tech@localhost/db', 'not a URL']) assert.equal(verifiedNeonConnectionString(value), value);
});
test('Effective host query override and encoded connection details are handled without exposing values', () => {
  const source = 'postgres://unit%40name:unit%2Fsecret@localhost/db?host=ep-example.aws.neon.tech&application_name=unit%20test';
  const before = new URL(source); const after = new URL(verifiedNeonConnectionString(source));
  assert.ok(before.username === after.username && before.password === after.password);
  assert.equal(after.searchParams.get('application_name'), 'unit test');
  assert.equal(after.searchParams.get('sslmode'), 'verify-full');
  const foreign = 'postgres://test:test@ep-example.aws.neon.tech/db?host=localhost&sslmode=disable';
  assert.equal(verifiedNeonConnectionString(foreign), foreign);
});
