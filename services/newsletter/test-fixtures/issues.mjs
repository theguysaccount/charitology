// Synthetic operation metadata and example.invalid addresses only.
import { randomBytes, randomUUID } from "node:crypto";
import { edition } from "../lib/content.mjs";
import { issueHash } from "../lib/issue-json.mjs";
import { validateMailIssueRegistry } from "../lib/editions.mjs";
import { CONSENT_VERSION, FROM } from "../lib/config.mjs";
let cached;
export function legacyRegistry() {
  if (!cached) {
    const node = {
      format: "charitology-letter-publication-lineage",
      version: 1,
      publicationId: "fictional-preserved-letter",
      publicationHash: issueHash({
        fictional: "public binding for isolated service tests",
      }),
      sequence: 1,
      supersedes: null,
    };
    const issue = {
      schemaVersion: 1,
      id: edition.id,
      publicationId: node.publicationId,
      publicationHash: node.publicationHash,
      hashAlgorithm: "ordered-json-mail-v1",
      rendererVersion: "legacy",
      title: edition.title,
      subject: edition.subject,
      html: edition.html,
      text: edition.text,
      hash: edition.hash,
    };
    const core = {
      format: "charitology-mail-issue-registry",
      version: 1,
      issues: [issue],
      lineage: [{ ...node, hash: issueHash(node) }],
    };
    cached = validateMailIssueRegistry({ ...core, hash: issueHash(core) });
  }
  return cached;
}
export function syntheticRegistry(count = 1) {
  const original = legacyRegistry(),
    issues = [...original.issues],
    lineage = [...original.lineage];
  for (let i = 1; i < count; i++) {
    const prior = lineage[0],
      node = {
        format: "charitology-letter-publication-lineage",
        version: 1,
        publicationId: `fictional-letter-${i + 1}`,
        publicationHash: issueHash({ fictionalPublication: i }),
        sequence: i + 1,
        supersedes: { id: prior.publicationId, hash: prior.publicationHash },
      };
    lineage.push({ ...node, hash: issueHash(node) });
    const core = {
      ...issues[0],
      id: `fixture-${String(i + 1).padStart(3, "0")}`,
      publicationId: node.publicationId,
      publicationHash: node.publicationHash,
      hashAlgorithm: "canonical-mail-v1",
      rendererVersion: 1,
      title: `Fictional ${i + 1}`,
      subject: `Fictional issue ${i + 1}`,
      html:
        issues[0].html.replace("THE CHARITOLOGY LETTER", `FICTIONAL ${i + 1}`) +
        `<!-- excluded synthetic issue ${i + 1} -->`,
      text: issues[0].text + `\nFictional issue ${i + 1}\n`,
    };
    delete core.hash;
    issues.push({ ...core, hash: issueHash(core) });
  }
  issues.sort((a, b) => (a.id < b.id ? -1 : 1));
  const core = { format: original.format, version: 1, issues, lineage };
  return validateMailIssueRegistry({ ...core, hash: issueHash(core) });
}
export function settings() {
  return {
    origin: "https://mail.charitology.org",
    allowedOrigins: new Set(["https://charitology.org"]),
    enabled: true,
    testOnly: true,
    testRecipient: "fictional@example.invalid",
    adminToken: "a".repeat(40),
    rateSecret: "r".repeat(40),
    domainId: "fixture-domain",
    segmentId: "fixture-segment",
    topicId: "fixture-topic",
  };
}
export function mockMail(configuration, registry) {
  const calls = [],
    drafts = new Map();
  let mode = null;
  const mail = {
    ready: async () => {
      calls.push("ready");
    },
    segmentContacts: async () => [
      {
        id: "fictional-contact",
        email: configuration.testRecipient,
        unsubscribed: false,
      },
    ],
    getBroadcast: async (id) => drafts.get(id),
    createBroadcast: async (issue) => {
      calls.push("create");
      if (mode === "create-error") throw Error("PRIVATE PROVIDER ERROR");
      if (mode === "create-malformed") return {};
      const id = "native-" + issue.id;
      drafts.set(id, {
        id,
        status: "draft",
        segment_id: configuration.segmentId,
        topic_id: configuration.topicId,
        from: FROM,
        reply_to: ["hello@charitology.org"],
        subject: issue.subject,
        html: issue.html,
        text: issue.text,
      });
      return { id };
    },
    sendBroadcast: async (id) => {
      calls.push("send");
      if (mode === "send-error") throw Error("PRIVATE PROVIDER ERROR");
      if (mode === "send-malformed") return { id: "wrong-native" };
      return { id };
    },
  };
  return { mail, calls, drafts, setMode: (value) => (mode = value) };
}
export function dependencies(db, registry, configuration = settings()) {
  const mocked = mockMail(configuration, registry);
  return {
    ...mocked,
    deps: {
      db,
      registry,
      settings: configuration,
      mail: mocked.mail,
      deadline: Date.now() + 45000,
      now: () => new Date().toISOString(),
      makeReviewId: () => randomBytes(32).toString("base64url"),
      makeOperationId: randomUUID,
    },
  };
}
export const activeConsent = {
  email: "fictional@example.invalid",
  consent_generation: "fixture-generation",
  consent_version: CONSENT_VERSION,
};
