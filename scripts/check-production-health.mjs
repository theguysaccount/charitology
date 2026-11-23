#!/usr/bin/env node
// Synthetic read-only health check across Charitology's live production surfaces.
// Does not authenticate, create records, send email, or mutate state.
import assert from 'node:assert/strict';

const TIMEOUT_MS = 15_000;
const UA = 'CharitologyUptimeMonitor/1.0 (+https://charitology.com)';

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'manual',
      ...init,
      headers: { 'user-agent': UA, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const checks = [
  {
    name: 'Main site (charitology.com)',
    run: async () => {
      const res = await fetchWithTimeout('https://charitology.com/', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const html = await res.text();
      assert.ok(html.includes('Charitology'), 'Missing brand marker in homepage HTML');
      return `HTTP ${res.status} (${html.length} bytes)`;
    },
  },
  {
    name: 'Legacy apex redirect (charitology.org -> charitology.com)',
    run: async () => {
      const res = await fetchWithTimeout('https://charitology.org/');
      assert.ok([301, 302, 307, 308].includes(res.status), `Expected 3xx redirect, got ${res.status}`);
      const location = res.headers.get('location') ?? '';
      assert.ok(location.startsWith('https://charitology.com'), `Unexpected redirect Location: ${location}`);
      return `HTTP ${res.status} -> ${location}`;
    },
  },
  {
    name: 'Public API v1 charity-index.json',
    run: async () => {
      const res = await fetchWithTimeout('https://charitology.com/api/v1/charity-index.json', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const payload = await res.json();
      assert.equal(payload.name, 'charity-index');
      const data = payload.data ?? {};
      assert.ok(Array.isArray(data.jurisdictions) && data.jurisdictions.length >= 20, `Expected >=20 jurisdictions, got ${data.jurisdictions?.length}`);
      assert.ok(
        typeof data.totalRegistryRecordsAcrossJurisdictions === 'number' && data.totalRegistryRecordsAcrossJurisdictions >= 2_900_000,
        `Unexpected totalRegistryRecordsAcrossJurisdictions: ${data.totalRegistryRecordsAcrossJurisdictions}`,
      );
      return `${data.jurisdictions.length} jurisdictions, ${data.totalRegistryRecordsAcrossJurisdictions.toLocaleString('en-US')} records`;
    },
  },
  {
    name: 'Public API v1 funding-flows.json',
    run: async () => {
      const res = await fetchWithTimeout('https://charitology.com/api/v1/funding-flows.json', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const payload = await res.json();
      assert.equal(payload.name, 'funding-flows');
      const data = payload.data ?? {};
      assert.ok(Array.isArray(data.entries) && data.entries.length >= 40, `Expected >=40 entries, got ${data.entries?.length}`);
      return `${data.entries.length} funding-flow entries`;
    },
  },
  {
    name: 'Browser extension release manifest',
    run: async () => {
      const res = await fetchWithTimeout('https://charitology.com/downloads/extension-release.json', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.equal(data.format, 'charitology-extension-release');
      assert.match(String(data.extensionVersion ?? ''), /^\d+\.\d+\.\d+$/, `Unexpected extensionVersion: ${data.extensionVersion}`);
      return `v${data.extensionVersion}`;
    },
  },
  {
    name: 'Charity OS shell (os.charitology.org)',
    run: async () => {
      const res = await fetchWithTimeout('https://os.charitology.org/', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const html = await res.text();
      assert.ok(html.includes('pilot-feedback-trigger'), 'Missing pilot-feedback-trigger in OS shell');
      assert.ok(html.includes('pilot-feedback-dialog'), 'Missing pilot-feedback-dialog in OS shell');
      return `HTTP ${res.status} (${html.length} bytes)`;
    },
  },
  {
    name: 'Charity OS session endpoint (/api/session)',
    run: async () => {
      const res = await fetchWithTimeout('https://os.charitology.org/api/session', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.equal(data.ok, true, `Expected ok=true, got ${JSON.stringify(data)}`);
      return `HTTP ${res.status}, ok=${data.ok}`;
    },
  },
  {
    name: 'Charity OS pilot-feedback auth & origin guards (/api/pilot-feedback)',
    run: async () => {
      const getRes = await fetchWithTimeout('https://os.charitology.org/api/pilot-feedback', { method: 'GET' });
      assert.equal(getRes.status, 405, `Expected GET 405, got ${getRes.status}`);

      const unauthRes = await fetchWithTimeout('https://os.charitology.org/api/pilot-feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://os.charitology.org',
        },
        body: JSON.stringify({ kind: 'bug', summary: 'synthetic probe' }),
      });
      assert.equal(unauthRes.status, 401, `Expected unauthenticated POST 401, got ${unauthRes.status}`);

      const badOriginRes = await fetchWithTimeout('https://os.charitology.org/api/pilot-feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.invalid',
        },
        body: JSON.stringify({ kind: 'bug', summary: 'synthetic probe' }),
      });
      assert.equal(badOriginRes.status, 403, `Expected cross-origin POST 403, got ${badOriginRes.status}`);
      return 'GET 405, unauth POST 401, cross-origin POST 403';
    },
  },
  {
    name: 'Newsletter & OS mail relay health (mail.charitology.org/api/health)',
    run: async () => {
      const res = await fetchWithTimeout('https://mail.charitology.org/api/health', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const data = await res.json();
      assert.equal(data.ok, true, `Expected ok=true, got ${JSON.stringify(data)}`);
      assert.equal(data.service, 'charitology-newsletter', `Unexpected service: ${data.service}`);
      return `HTTP ${res.status}, sendingFlagEnabled=${Boolean(data.sendingFlagEnabled)}`;
    },
  },
];

let failures = 0;
console.log(`Charitology production health check (${new Date().toISOString()})`);
for (const check of checks) {
  const started = Date.now();
  try {
    const detail = await check.run();
    const elapsed = Date.now() - started;
    console.log(`PASS  [${elapsed}ms] ${check.name} — ${detail}`);
  } catch (error) {
    failures++;
    const elapsed = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL  [${elapsed}ms] ${check.name} — ${message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks.length} production health checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} production health checks passed.`);
