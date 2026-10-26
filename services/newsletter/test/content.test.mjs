import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { edition, escapeHtml, renderPage } from '../lib/content.mjs';

const links = [
  'https://charitology.org/roadmap/',
  'https://charitology.org/programs/evidence-reviews/',
  'https://charitology.org/record/principles/read/',
  'https://charitology.org/programs/principles-course/',
  'https://charitology.org/record/country-profiles/',
  'https://charitology.org/record/charitology-100/',
  'https://charitology.org/record/podcast-and-newsletter/',
  'https://charitology.org/contribute/review/',
  'https://charitology.org/newsletter.xml',
  'https://charitology.org/record/newsletter/edition-1/',
];

test('Edition 1 preserves every editorial section and its scope labels', async () => {
  const original = await readFile(new URL('../../../src/pages/record/newsletter/edition-1.astro', import.meta.url), 'utf8');
  assert.equal(edition.id, 'edition-1');
  assert.equal(edition.title, 'A system we can question');
  assert.match(edition.subject, /Edition 1: A system we can question/);
  const sections = [
    'The full ambition is public', 'Try one concrete piece of work',
    'What would make this useful?', 'A question for your next meeting',
  ];
  for (const section of sections) {
    assert.ok(original.includes(section), `Source section exists: ${section}`);
    assert.ok(edition.html.includes(`<h2>${section}</h2>`), section);
    assert.ok(edition.text.includes(section.toUpperCase()), section);
  }
  const scope = [
    'It is an editorial draft, produced with AI assistance.',
    'a research desk does not establish a staffed institute, a fund or a professional credential.',
    'Completion records describe self-study.',
    'keeping national statistics separate from local interpretation.',
    'The tool does not publish a ranking.',
    'Each episode discloses computer narration and links to its transcript and sources.',
    'Public contributions should avoid personal details about people receiving support.',
    'This is a proposed learning practice; its effectiveness still needs testing.',
  ];
  for (const phrase of scope) {
    assert.ok(edition.html.includes(phrase), `HTML: ${phrase}`);
    assert.ok(edition.text.includes(phrase), `Text: ${phrase}`);
  }
  assert.match(edition.text, /What evidence would change the decision we are about to make\?/);
  const normalize = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  // The published page has signup/RSS/privacy controls; the sent edition has
  // its native unsubscribe footer. All editorial body blocks must still match.
  assert.ok(original.includes("<p data-letter-delivery-footer>"));
  const editorialSource = original.replace(/<p data-letter-delivery-footer>[\s\S]*?<\/p>/, "");
  const originalBlocks = [...editorialSource.matchAll(/<(p|li|blockquote)>([\s\S]*?)<\/\1>/g)]
    .map(match => normalize(match[2]));
  assert.ok(originalBlocks.length >= 10, 'The source has substantive paragraphs, activities and a meeting question.');
  for (const block of originalBlocks) {
    assert.ok(normalize(edition.html).includes(block), `Full HTML block: ${block}`);
    assert.ok(normalize(edition.text).includes(block), `Full plain-text block: ${block}`);
  }
  assert.doesNotMatch(edition.html, /Email delivery is not configured|print-letter/);
});

test('Both formats retain every source and reading link as absolute HTTPS', () => {
  for (const link of links) {
    assert.ok(edition.html.includes(`href="${link}"`), `HTML link: ${link}`);
    assert.ok(edition.text.includes(link), `Text link: ${link}`);
  }
  const hrefs = [...edition.html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  for (const href of hrefs) {
    if (href === '{{{RESEND_UNSUBSCRIBE_URL}}}') continue;
    const parsed = new URL(href);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.hostname, 'charitology.org');
    assert.equal(parsed.username, '');
    assert.equal(parsed.password, '');
  }
  assert.doesNotMatch(edition.html, /href="\//);
});

test('Native unsubscribe token stays literal in HTML and plain text', () => {
  const token = '{{{RESEND_UNSUBSCRIBE_URL}}}';
  assert.equal(edition.html.split(token).length - 1, 1);
  assert.equal(edition.text.split(token).length - 1, 1);
  assert.ok(edition.html.includes(`href="${token}"`));
  assert.doesNotMatch(edition.html, /%7B|&#123;|&lbrace;/i);
  const address = '938 Peacock Station Rd, McLean, VA 22102';
  assert.ok(edition.html.includes(address));
  assert.ok(edition.text.includes(address));
});

test('HTML escaping protects text and quoted attributes', () => {
  assert.equal(escapeHtml('<script>"x" & \'y\'</script>'), '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml('care, justice and flourishing'), 'care, justice and flourishing');
  assert.equal(escapeHtml('雪 & care'), '雪 &amp; care');
});

test('Page renderer escapes its title and preserves trusted authored body', () => {
  const page = renderPage('<img src=x onerror="alert(1)"> & letter', '<p>Trusted <strong>authored</strong> body.</p>');
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta charset="utf-8">/);
  assert.match(page, /name="viewport"/);
  assert.ok(page.includes('<h1>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; letter</h1>'));
  assert.ok(page.includes('<title>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; letter · Charitology</title>'));
  assert.ok(page.includes('<p>Trusted <strong>authored</strong> body.</p>'));
  assert.doesNotMatch(page, /<img|<script/);
  assert.doesNotMatch(page, /RESEND_UNSUBSCRIBE_URL/, 'Generic form pages must not include an email-only token.');
});

test('Content hash covers both formats and all edition metadata deterministically', async () => {
  const { id, subject, title, html, text, hash } = edition;
  const digest = payload => createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, digest({ id, subject, title, html, text }));
  for (const key of ['id', 'subject', 'title', 'html', 'text']) {
    assert.notEqual(hash, digest({ id, subject, title, html, text, [key]: edition[key] + ' changed' }), key);
  }
  const reimported = await import('../lib/content.mjs?stable-content-check');
  assert.equal(reimported.edition.hash, hash);
  assert.ok(Object.isFrozen(edition));
});
