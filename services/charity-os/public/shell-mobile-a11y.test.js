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
  ]) {
    const html = read(file);
    assert.ok(html.includes(`class="skip" href="#${mainId}"`), `${file} missing skip link to #${mainId}`);
    assert.ok(html.includes(`id="${mainId}"`) && html.includes('tabindex="-1"'), `${file} missing focusable main landmark`);
    assert.ok(!html.includes('href="https://charitology.org'), `${file} retains legacy https://charitology.org link`);
    assert.ok(html.includes('href="https://charitology.com/'), `${file} missing canonical https://charitology.com link`);
  }

  const mcpHtml = read('mcp.html');
  assert.ok(!mcpHtml.includes('href="https://charitology.org'), 'mcp.html retains legacy charitology.org link');
  assert.ok(mcpHtml.includes('https://os.charitology.org/mcp'), 'mcp.html must keep os.charitology.org MCP endpoint');
  assert.ok(mcpHtml.includes('href="https://charitology.com/api/v1/index.json"'), 'mcp.html missing canonical API link');
});

test('Charity OS narrow-screen CSS keeps header .site-link controls accessible without display:none', () => {
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
});
