// Build/check only. The deployed service never imports the public source tree.
import {
  validatePublicationRegistry,
  publicationMailLineage,
  publicationLegacyMailBinding,
} from "../../../src/lib/publication-editions-model.mjs";
import { edition as legacy, escapeHtml, renderPage } from "./content.mjs";
import {
  exactIssue,
  issueHash,
  issueId,
  plainIssueValue,
} from "./issue-json.mjs";
import { mailIssueFiles, validateMailIssueRegistry } from "./editions.mjs";

function authoredIssue(edition, id) {
  const entries = edition.core.members.filter(
    (x) => x.payload.kind === "authored-letter-v1",
  );
  if (entries.length !== 1)
    throw new Error("One fixed authored Letter member required");
  const p = entries[0].payload,
    html = [],
    text = [];
  for (const b of p.blocks) {
    if (b.kind === "heading") {
      html.push(`<h2>${escapeHtml(b.text)}</h2>`);
      text.push(b.text.toUpperCase());
    } else if (b.kind === "paragraph") {
      html.push(`<p>${escapeHtml(b.text)}</p>`);
      text.push(b.text);
    } else if (b.kind === "list") {
      html.push(
        "<ul>" +
          b.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("") +
          "</ul>",
      );
      text.push(b.items.map((x) => "- " + x).join("\n"));
    } else if (b.kind === "links") {
      const links = b.items.map((x) => {
        const u = new URL(x.url, "https://charitology.org");
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          /unsubscribe/i.test(u.pathname) ||
          u.href.includes("{{")
        )
          throw new Error("Unsupported mail link");
        return { label: x.label, url: u.href };
      });
      html.push(
        "<p>" +
          links
            .map(
              (x) =>
                `<a href="${escapeHtml(x.url)}">${escapeHtml(x.label)}</a>`,
            )
            .join(" · ") +
          "</p>",
      );
      text.push(links.map((x) => `${x.label}: ${x.url}`).join("\n"));
    } else throw new Error("Unsupported fixed Letter block");
  }
  const url = `https://charitology.org/record/editions/${edition.core.id}/`,
    unsubscribe = "{{{RESEND_UNSUBSCRIBE_URL}}}",
    address = "938 Peacock Station Rd, McLean, VA 22102";
  const core = {
    schemaVersion: 1,
    id,
    publicationId: edition.core.id,
    publicationHash: edition.hash,
    hashAlgorithm: "canonical-mail-v1",
    rendererVersion: 1,
    title: p.title,
    subject: `The Charitology Letter · ${edition.core.sequence}: ${p.title}`,
    html: renderPage(
      p.title,
      `<p>The Charitology Letter · ${escapeHtml(p.declaredDate)} · Editorial draft</p><p>${escapeHtml(p.summary)}</p>${html.join("\n")}<p>${escapeHtml(p.publicByline)} · AI assistance: ${escapeHtml(p.aiAssistance)}</p><p><a href="${url}">Read this fixed publication</a></p><footer><p>Charitology<br>${address}</p><p><a href="https://mail.charitology.org/privacy">Email privacy</a> · <a href="${unsubscribe}">Unsubscribe from the Charitology Letter</a></p></footer>`,
    ),
    text: `THE CHARITOLOGY LETTER\n${p.declaredDate} · Editorial draft\n\n${p.title}\n\n${p.summary}\n\n${text.join("\n\n")}\n\n${p.publicByline}\nAI assistance: ${p.aiAssistance}\nRead this fixed publication: ${url}\n\nCharitology\n${address}\nEmail privacy: https://mail.charitology.org/privacy\nUnsubscribe from the Charitology Letter: ${unsubscribe}\n`,
  };
  return { ...core, hash: issueHash(core) };
}
export function generateMailIssueRegistry(
  publicInput,
  { selections, previousRegistry } = {},
) {
  const input = plainIssueValue(selections);
  if (!Array.isArray(input) || !input.length || input.length > 100)
    throw new Error("Explicit mail selections required");
  const v = validatePublicationRegistry(publicInput),
    binding = publicationLegacyMailBinding(v);
  const previous = previousRegistry
      ? validateMailIssueRegistry(previousRegistry)
      : null,
    issues = previous ? [...previous.issues] : [];
  const selectionIds = new Set();
  for (const s of input) {
    exactIssue(s, ["publicationId", "issueId"]);
    issueId(s.publicationId);
    issueId(s.issueId);
    if (selectionIds.has(s.issueId))
      throw new Error("Duplicate mail selection");
    selectionIds.add(s.issueId);
    const e = v.editions.find((x) => x.core.id === s.publicationId);
    if (!e || e.core.family !== "letter")
      throw new Error("Mail requires an exact fixed Letter publication");
    let issue;
    if (s.issueId === "edition-1") {
      if (
        binding.publicationId !== s.publicationId ||
        binding.publicationHash !== e.hash ||
        ["id", "title", "subject", "html", "text", "hash"].some(
          (k) => binding[k] !== legacy[k],
        )
      )
        throw new Error("Legacy public/mail binding differs");
      issue = {
        schemaVersion: 1,
        id: legacy.id,
        publicationId: e.core.id,
        publicationHash: e.hash,
        hashAlgorithm: "ordered-json-mail-v1",
        rendererVersion: "legacy",
        title: legacy.title,
        subject: legacy.subject,
        html: legacy.html,
        text: legacy.text,
        hash: legacy.hash,
      };
    } else {
      if (e.core.legacyMail)
        throw new Error("Legacy artifact cannot use a new mail alias");
      issue = authoredIssue(e, s.issueId);
    }
    const old = issues.find((x) => x.id === issue.id);
    if (old) {
      if (issueHash(old) !== issueHash(issue))
        throw new Error("Historical mail issue cannot change");
    } else issues.push(issue);
  }
  for (const x of issues) {
    const e = v.editions.find(
      (e) => e.core.id === x.publicationId && e.hash === x.publicationHash,
    );
    if (!e) throw new Error("Historical public mail binding unavailable");
  }
  issues.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const core = {
    format: "charitology-mail-issue-registry",
    version: 1,
    issues,
    lineage: publicationMailLineage(
      v,
      issues.map((x) => x.publicationId),
    ),
  };
  return validateMailIssueRegistry(
    { ...core, hash: issueHash(core) },
    { previousRegistry: previous || undefined },
  );
}
export function generateMailIssueFiles(publicInput, options) {
  return mailIssueFiles(generateMailIssueRegistry(publicInput, options));
}
