import { createHash } from 'node:crypto';

/** Escape a value for an HTML text node or a quoted attribute. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

/**
 * Render a complete, script-free page. `body` is trusted authored HTML;
 * callers must escape any user-supplied values before inserting them.
 */
export function renderPage(title, body) {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} · Charitology</title>
  <style>
    body { margin: 0; background: #f7f6f2; color: #222820; font: 18px/1.6 Georgia, serif; }
    main { box-sizing: border-box; max-width: 680px; margin: 0 auto; padding: 32px 24px; overflow-wrap: anywhere; }
    h1 { font-size: 2rem; line-height: 1.15; margin: 16px 0 24px; }
    h2 { font-size: 1.35rem; line-height: 1.3; margin-top: 32px; }
    a { color: #185c45; text-decoration: underline; }
    li { margin-bottom: 12px; }
    blockquote { border-left: 3px solid #185c45; margin: 24px 0; padding-left: 18px; }
    .eyebrow, footer { font: 14px/1.6 Arial, sans-serif; }
    footer { border-top: 1px solid #c9cbbf; margin-top: 32px; padding-top: 20px; }
    label { display: block; margin: 16px 0 4px; }
    input, button { box-sizing: border-box; max-width: 100%; font: inherit; padding: 10px 12px; }
    input[type="email"], input[type="text"] { width: 100%; }
    button { cursor: pointer; background: #185c45; color: white; border: 1px solid #185c45; }
    .note { font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow"><a href="https://charitology.org/">Charitology</a> · The science of doing the most good</p>
    <h1>${safeTitle}</h1>
${body}
  </main>
</body>
</html>`;
}

// Adapted from src/pages/record/newsletter/edition-1.astro. The email omits
// the page's print button and replaces its delivery-setup note with this
// delivery footer. All editorial claims and their limits remain visible.
const id = 'edition-1';
const title = 'A system we can question';
const subject = 'The Charitology Letter · Edition 1: A system we can question';
const unsubscribe = '{{{RESEND_UNSUBSCRIBE_URL}}}';
const address = '938 Peacock Station Rd, McLean, VA 22102';
const editionUrl = 'https://charitology.org/record/newsletter/edition-1/';

const html = renderPage(title, `
    <p class="eyebrow">The Charitology Letter · Edition 1 · October 25, 2026</p>
    <p>The complete brief, working research desks, an open course and a way to keep uncertainty visible.</p>
    <p>Generosity is already here. Charitology asks how its signals, channels, work and feedback can help it reach the outcomes people value. This letter is an invitation to use the tools, challenge the assumptions and improve the record. It is an editorial draft, produced with AI assistance.</p>
    <h2>The full ambition is public</h2>
    <p>The <a href="https://charitology.org/roadmap/">66-item original brief</a> includes research programs, donor tools and information bases. Every item has a public page. Its software status describes the function available on that page; a research desk does not establish a staffed institute, a fund or a professional credential.</p>
    <h2>Try one concrete piece of work</h2>
    <ul>
      <li>Use the <a href="https://charitology.org/programs/evidence-reviews/">Evidence Reviews desk</a> to define a question, track inclusion decisions and extract study results.</li>
      <li>Read the <a href="https://charitology.org/record/principles/read/">complete textbook</a>, then work through the <a href="https://charitology.org/programs/principles-course/">self-paced course</a>. Completion records describe self-study.</li>
      <li>Compare dated indicators in the <a href="https://charitology.org/record/country-profiles/">country data desk</a>, keeping national statistics separate from local interpretation.</li>
      <li>Make a <a href="https://charitology.org/record/charitology-100/">nomination packet</a> that includes the strongest objection, funding limits and missing voices. The tool does not publish a ranking.</li>
      <li>Listen to <a href="https://charitology.org/record/podcast-and-newsletter/">Principles read aloud</a>. Each episode discloses computer narration and links to its transcript and sources.</li>
    </ul>
    <h2>What would make this useful?</h2>
    <p>A page is useful if it improves a real decision or makes an assumption easier to challenge. It is not useful merely because it exists. If a form omits a crucial question, a classification hides a disagreement or a claim outruns its source, open a correction. Public contributions should avoid personal details about people receiving support.</p>
    <h2>A question for your next meeting</h2>
    <blockquote>What evidence would change the decision we are about to make?</blockquote>
    <p>Write the answer before seeing the next result. Record who can act on it and how people affected by the work can challenge it. Then return to that record after the decision. This is a proposed learning practice; its effectiveness still needs testing.</p>
    <p><a href="https://charitology.org/contribute/review/">Review an entry</a> · <a href="https://charitology.org/newsletter.xml">Subscribe to this letter by RSS</a> · <a href="${editionUrl}">Read this edition online</a></p>
    <footer>
      <p>Charitology<br>${escapeHtml(address)}</p>
      <p><a href="${unsubscribe}">Unsubscribe from the Charitology Letter</a></p>
    </footer>`);

const text = `THE CHARITOLOGY LETTER
Edition 1 · October 25, 2026

${title}

The complete brief, working research desks, an open course and a way to keep uncertainty visible.

Generosity is already here. Charitology asks how its signals, channels, work and feedback can help it reach the outcomes people value. This letter is an invitation to use the tools, challenge the assumptions and improve the record. It is an editorial draft, produced with AI assistance.

THE FULL AMBITION IS PUBLIC

The 66-item original brief includes research programs, donor tools and information bases. Every item has a public page. Its software status describes the function available on that page; a research desk does not establish a staffed institute, a fund or a professional credential.
Original brief and roadmap: https://charitology.org/roadmap/

TRY ONE CONCRETE PIECE OF WORK

- Use the Evidence Reviews desk to define a question, track inclusion decisions and extract study results.
  https://charitology.org/programs/evidence-reviews/

- Read the complete textbook, then work through the self-paced course. Completion records describe self-study.
  Textbook: https://charitology.org/record/principles/read/
  Course: https://charitology.org/programs/principles-course/

- Compare dated indicators in the country data desk, keeping national statistics separate from local interpretation.
  https://charitology.org/record/country-profiles/

- Make a nomination packet that includes the strongest objection, funding limits and missing voices. The tool does not publish a ranking.
  https://charitology.org/record/charitology-100/

- Listen to Principles read aloud. Each episode discloses computer narration and links to its transcript and sources.
  https://charitology.org/record/podcast-and-newsletter/

WHAT WOULD MAKE THIS USEFUL?

A page is useful if it improves a real decision or makes an assumption easier to challenge. It is not useful merely because it exists. If a form omits a crucial question, a classification hides a disagreement or a claim outruns its source, open a correction. Public contributions should avoid personal details about people receiving support.

A QUESTION FOR YOUR NEXT MEETING

What evidence would change the decision we are about to make?

Write the answer before seeing the next result. Record who can act on it and how people affected by the work can challenge it. Then return to that record after the decision. This is a proposed learning practice; its effectiveness still needs testing.

Review an entry: https://charitology.org/contribute/review/
Subscribe to this letter by RSS: https://charitology.org/newsletter.xml
Read this edition online: ${editionUrl}

Charitology
${address}

Unsubscribe from the Charitology Letter:
${unsubscribe}
`;

// This hash covers the complete reviewed content, including subject and
// plain text. No recipient data, token substitution or timestamp enters it.
const payload = { id, subject, title, html, text };
export const edition = Object.freeze({
  ...payload,
  hash: createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex'),
});
