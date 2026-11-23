import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');

test('Charity OS HTML shells retain skip links, focusable main landmarks and canonical charitology.com links', () => {
  for (const [file, mainId] of [
    ['index.html', 'main'],
    ['intake.html', 'intake-main'],
    ['participant.html', 'participant-main'],
    ['mcp.html', 'mcp-main'],
  ]) {
    const html = read(file);
    assert.ok(html.includes(`class="skip" href="#${mainId}"`), `${file} missing skip link to #${mainId}`);
    assert.ok(html.includes(`id="${mainId}"`) && html.includes('tabindex="-1"'), `${file} missing focusable main landmark`);
    assert.ok(!html.includes('href="https://charitology.org'), `${file} retains legacy https://charitology.org link`);
    assert.ok(html.includes('href="https://charitology.com'), `${file} missing canonical https://charitology.com link`);
  }

  const mcpHtml = read('mcp.html');
  assert.ok(mcpHtml.includes('rel="canonical" href="https://os.charitology.org/mcp.html"'), 'mcp.html missing canonical link');
  assert.ok(mcpHtml.includes('href="/os.css"'), 'mcp.html should use shared os.css stylesheet');
  assert.ok(mcpHtml.includes('https://os.charitology.org/mcp'), 'mcp.html must keep os.charitology.org MCP endpoint');
  assert.ok(mcpHtml.includes('href="https://charitology.com/api/v1/index.json"'), 'mcp.html missing canonical API link');

  const indexHtml = read('index.html');
  assert.ok(indexHtml.includes('id="pilot-feedback-trigger"'), 'index.html missing masthead Pilot feedback trigger');
  assert.ok(indexHtml.includes('id="pilot-feedback-dialog"'), 'index.html missing accessible Pilot feedback dialog');
});

test('Charity OS /intake route rewrites cleanly and intake.js rejects non-/p/ paths before network fetch', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(publicDir, '..', 'vercel.json'), 'utf8'));
  assert.ok(
    vercelConfig.rewrites.some((rule) => rule.source === '/intake' && rule.destination === '/intake.html'),
    'vercel.json must rewrite /intake to /intake.html'
  );
  const intakeJs = read('intake.js');
  assert.ok(
    intakeJs.includes('!cleanPath.startsWith("/p/")'),
    'intake.js must reject bare /intake and /intake.html paths client-side without fetching /api/public/intake/intake/html'
  );
});

test('Charity OS narrow-screen CSS keeps header, dialog, and footer controls accessible without clipping', () => {
  const css = read('os.css');
  const mobileBlock = css.match(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(mobileBlock, 'Expected @media (max-width: 760px) block in os.css');
  assert.ok(
    !/\.site-link\s*\{[^}]*display\s*:\s*none/i.test(mobileBlock[1]),
    'Mobile masthead must not hide .site-link links with display:none'
  );
  assert.ok(
    /\.masthead\s*\{[^}]*flex-wrap\s*:\s*wrap/i.test(mobileBlock[1]),
    'Mobile masthead should wrap cleanly so narrow viewports never overflow'
  );
  assert.ok(
    /\.pilot-feedback-dialog\s+\.dialog-actions\s*\{[^}]*position\s*:\s*static/i.test(css),
    'Pilot feedback dialog actions must not stay sticky and cover signed-out/fallback notes on narrow screens'
  );
  assert.ok(
    /\.intake-footer\s+a\s*\{[^}]*min-height\s*:\s*36px/i.test(css) &&
    /\.ruled-links\s+a\s*\{[^}]*min-height\s*:\s*36px/i.test(css),
    'Footer and ruled links must provide >=36px touch targets'
  );
});
