import { fail, hash } from "./security.mjs";
import {
  IncubatorError,
  parseIncubatorJSON,
  incubatorObject,
  incubatorHash as H,
  incubatorSame,
} from "./incubator-bridge-json.mjs";
import {
  currentIncubatorMember,
  requireIncubatorMember,
  requireIncubatorScope,
  incubatorUnavailable,
} from "./incubator-bridge-access.mjs";
import {
  incubatorQuery,
  readIncubatorJSON,
  incubatorCommitInput,
} from "./incubator-bridge-requests.mjs";
import {
  incubatorUploadPart,
  storeIncubatorUploadPart,
  assembledIncubatorUpload,
  removeIncubatorUpload,
} from "./incubator-bridge-uploads.mjs";
import {
  inspectIncubatorSource,
  previewIncubatorCopy,
  previewIncubatorAdoption,
  commitIncubatorCopy,
} from "./incubator-bridge-commands.mjs";
import {
  loadIncubatorInventory,
  incubatorSource,
  currentIncubatorDisposition,
  encodeIncubatorCursor,
} from "./incubator-bridge-store.mjs";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const okay = (value) =>
  new Response(JSON.stringify({ ok: true, ...value }), { headers });
const canScope = (member, id) =>
  !member.programIds.length || member.programIds.includes(id);
function cursorInput(text) {
  if (text === null) return null;
  if (
    typeof text !== "string" ||
    text.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(text)
  )
    fail(422, "incubator_cursor", "This history cursor is invalid.");
  const bytes = Buffer.from(text, "base64url");
  if (bytes.toString("base64url") !== text || bytes.length > 2048)
    fail(422, "incubator_cursor", "This history cursor is invalid.");
  const value = parseIncubatorJSON(bytes, 2048);
  incubatorObject(value, ["kind", "inventorySha256", "after"]);
  if (
    !["live", "recovered"].includes(value.kind) ||
    typeof value.inventorySha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.inventorySha256) ||
    typeof value.after !== "string" ||
    value.after.length > 204
  )
    fail(422, "incubator_cursor", "This history cursor is invalid.");
  return value;
}
async function summary(c, org, binding, member) {
  return {
    originOrgId: binding.originOrgId,
    bindingId: binding.bindingId,
    originMode: binding.originMode,
    programId: binding.programId,
    head: binding.head,
    source: binding.source,
    selection: binding.selection,
    nativeVersions: binding.nativeSources.length,
    eventCount: binding.events.length,
    currentDisposition: await currentIncubatorDisposition(
      c,
      org,
      binding.currentEvent,
      member,
    ),
  };
}
async function readRoute(c, { org, member, tail, url }) {
  const query = incubatorQuery(url, ["cursor"]),
    inventory = await loadIncubatorInventory(c, org);
  const recovered = tail === "recovered" || tail.startsWith("recovered/");
  if (recovered) requireIncubatorMember(member, { administrator: true });
  const allowed = inventory.bindings.filter(
    (value) =>
      value.originMode === (recovered ? "recovered" : "live") &&
      (recovered || value.originOrgId === org) &&
      canScope(member, value.programId),
  );
  if (tail === "bindings" || tail === "recovered") {
    const kind = recovered ? "recovered" : "live",
      inventorySha256 = H(
        "cursor",
        allowed.map((value) => value.head),
      ),
      cursor = cursorInput(query.get("cursor"));
    if (
      cursor &&
      (cursor.kind !== kind || cursor.inventorySha256 !== inventorySha256)
    )
      fail(
        409,
        "incubator_cursor",
        "The history advanced. Open its current first page again.",
      );
    const sorted = [...allowed].sort((a, b) =>
      (a.originOrgId + ":" + a.bindingId).localeCompare(
        b.originOrgId + ":" + b.bindingId,
      ),
    );
    const start = cursor
      ? sorted.findIndex(
          (value) => value.originOrgId + ":" + value.bindingId === cursor.after,
        ) + 1
      : 0;
    if (cursor && start === 0)
      fail(422, "incubator_cursor", "This history cursor is invalid.");
    const page = sorted.slice(start, start + 20),
      last = page.at(-1);
    return okay({
      bindings: await Promise.all(
        page.map((value) => summary(c, org, value, member)),
      ),
      nextCursor:
        start + 20 < sorted.length
          ? encodeIncubatorCursor({
              kind,
              inventorySha256,
              after: last.originOrgId + ":" + last.bindingId,
            })
          : null,
    });
  }
  if (query.has("cursor"))
    fail(
      422,
      "incubator_query",
      "This complete binding does not accept a cursor.",
    );
  const parts = tail.split("/");
  if (parts.length !== 2 || !["bindings", "recovered"].includes(parts[0]))
    fail(404, "incubator_route", "This source-history route is unavailable.");
  const matches = allowed.filter((value) =>
    recovered ? value.head.sha256 === parts[1] : value.bindingId === parts[1],
  );
  if (matches.length !== 1) incubatorUnavailable();
  const binding = matches[0];
  requireIncubatorScope(member, binding.programId);
  const source = incubatorSource(inventory, binding.source);
  return okay({
    binding: await summary(c, org, binding, member),
    source,
    nativeSources: binding.nativeSources,
    events: binding.events,
    nextCursor: null,
  });
}

/** Mounted after real authentication/CSRF and before the generic JSON reader. */
export async function incubatorBridgeRoutes({ request, url, db, session }) {
  const match = url.pathname.match(
    /^\/api\/orgs\/([A-Za-z0-9_-]{1,100})\/incubator-bridge(?:\/(.*))?$/,
  );
  if (!match) return null;
  const [, org, tail = ""] = match,
    method = request.method;
  try {
    if (!["GET", "POST"].includes(method))
      fail(405, "incubator_method", "Use the documented source action.");
    await db.limit(
      `incubator-${method === "GET" ? "read" : "write"}:${hash(session.user.id)}`,
      method === "GET" ? 120 : 60,
      3600,
    );
    if (method === "GET")
      return await db.tx(
        session.user.id,
        org,
        async (c) =>
          readRoute(c, {
            org,
            member: await currentIncubatorMember(c, org, session, {
              readOnly: true,
            }),
            tail,
            url,
          }),
        { readOnly: true },
      );
    incubatorQuery(url, []);
    if (
      ![
        "uploads",
        "source/inspect",
        "copy/preview",
        "adopt/preview",
        "commit",
      ].includes(tail)
    )
      fail(404, "incubator_route", "This source action is unavailable.");
    // Refuse inaccessible sessions/roles before decoding an upload or native file.
    await db.tx(session.user.id, org, (c) =>
      currentIncubatorMember(c, org, session, {
        administrator: tail === "adopt/preview",
      }),
    );
    const input = await readIncubatorJSON(
      request,
      tail === "uploads" ? 2008192 : tail === "commit" ? 4096 : 131072,
    );
    if (tail === "uploads") {
      incubatorUploadPart(input);
      if (input.index === 0)
        await db.limit(`incubator-upload:${hash(session.user.id)}`, 6, 900);
    }
    return await db.tx(
      session.user.id,
      org,
      async (c) => {
        const member = await currentIncubatorMember(c, org, session, {
            administrator: tail === "adopt/preview",
          }),
          args = { org, member, session, input };
        if (tail === "uploads") return storeIncubatorUploadPart(c, args);
        if (tail === "source/inspect") {
          const uploaded = await assembledIncubatorUpload(c, args);
          const result = await inspectIncubatorSource(c, {
            ...args,
            metadata: uploaded.metadata,
            native: uploaded.native,
          });
          await removeIncubatorUpload(c, org, uploaded);
          return okay(result);
        }
        if (tail === "copy/preview")
          return okay(await previewIncubatorCopy(c, args));
        if (tail === "adopt/preview")
          return okay(await previewIncubatorAdoption(c, args));
        return okay(
          await commitIncubatorCopy(c, {
            ...args,
            input: incubatorCommitInput(input),
          }),
        );
      },
      { lock: true },
    );
  } catch (error) {
    if (error instanceof IncubatorError)
      return new Response(
        JSON.stringify({
          ok: false,
          code: error.code,
          message: error.message,
          ...(error.issues ? { issues: error.issues } : {}),
        }),
        { status: error.status, headers },
      );
    throw error;
  }
}
