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
      assert.ok(Array.isArray(data.jurisdictions) && data.jurisdictions.length >= 27, `Expected >=27 jurisdictions, got ${data.jurisdictions?.length}`);
      assert.ok(
        typeof data.totalRegistryRecordsAcrossJurisdictions === 'number' && data.totalRegistryRecordsAcrossJurisdictions >= 3_200_000,
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
      assert.ok(Array.isArray(data.entries) && data.entries.length >= 45, `Expected >=45 entries, got ${data.entries?.length}`);
      return `${data.entries.length} funding-flow entries`;
    },
  },
  {
    name: 'Agent-first /tools/ quickstart & MCP handoff',
    run: async () => {
      const res = await fetchWithTimeout('https://charitology.com/tools/', { redirect: 'follow' });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      const html = await res.text();
      assert.ok(html.includes('https://os.charitology.org/mcp'), 'Missing MCP endpoint on /tools/');
      assert.ok(html.includes('Pick the fastest way in'), 'Missing 3-path quickstart heading on /tools/');
      return `HTTP ${res.status} (${html.length} bytes)`;
    },
  },
  {
    name: 'Free Things for Charities directory (/for-charities/free/ + JSON)',
    run: async () => {
      const pageRes = await fetchWithTimeout('https://charitology.com/for-charities/free/', { redirect: 'follow' });
      assert.equal(pageRes.status, 200, `Expected 200, got ${pageRes.status}`);
      const jsonRes = await fetchWithTimeout('https://charitology.com/data/free-charity-resources.json', { redirect: 'follow' });
      assert.equal(jsonRes.status, 200, `Expected 200, got ${jsonRes.status}`);
      const payload = await jsonRes.json();
      assert.ok(Array.isArray(payload.items) && payload.items.length >= 65, `Expected >=65 programs, got ${payload.items?.length}`);
      return `HTTP ${pageRes.status}, ${payload.items.length} verified programs`;
    },
  },
  {
    name: 'Canonical sitemap.xml & /llms.txt discovery',
    run: async () => {
      const smRes = await fetchWithTimeout('https://charitology.com/sitemap.xml', { redirect: 'follow' });
      assert.equal(smRes.status, 200, `Expected 200, got ${smRes.status}`);
      const smXml = await smRes.text();
      const locs = smXml.match(/<loc>/g)?.length ?? 0;
      assert.ok(locs >= 590, `Expected >=590 sitemap URLs, got ${locs}`);
      const llmsRes = await fetchWithTimeout('https://charitology.com/llms.txt', { redirect: 'follow' });
      assert.equal(llmsRes.status, 200, `Expected 200, got ${llmsRes.status}`);
      const llmsTxt = await llmsRes.text();
      assert.ok(llmsTxt.includes('https://os.charitology.org/mcp'), 'Missing MCP endpoint in /llms.txt');
      return `${locs} sitemap URLs, /llms.txt ${llmsTxt.length} bytes`;
    },
  },
  {
    name: 'Charity OS crawl files (robots.txt & sitemap.xml)',
    run: async () => {
      const robRes = await fetchWithTimeout('https://os.charitology.org/robots.txt', { redirect: 'follow' });
      assert.equal(robRes.status, 200, `Expected 200, got ${robRes.status}`);
      const robTxt = await robRes.text();
      assert.ok(robTxt.includes('Sitemap: https://os.charitology.org/sitemap.xml'), 'Missing Sitemap directive in Charity OS robots.txt');
      const osSmRes = await fetchWithTimeout('https://os.charitology.org/sitemap.xml', { redirect: 'follow' });
      assert.equal(osSmRes.status, 200, `Expected 200, got ${osSmRes.status}`);
      return `robots.txt & sitemap.xml HTTP 200`;
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
