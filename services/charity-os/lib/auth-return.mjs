import { fail } from "./security.mjs";

// Only a same-origin landing choice travels through sign-in. Receipts never do.
export function authDestination(value) {
  if (value === undefined || value === null || value === "workspace")
    return { name: "workspace", path: "/" };
  if (value === "participant")
    return { name: "participant", path: "/participant" };
  fail(400, "destination", "Choose a supported sign-in destination.");
}

export function confirmDestination(parameters) {
  if (parameters.getAll("destination").length > 1)
    fail(400, "destination", "Use one sign-in destination.");
  return authDestination(parameters.get("destination"));
}

export async function confirmForm(request) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    fail(400, "form", "Use the sign-in confirmation form.");
  let size = 0;
  const chunks = [];
  for await (const chunk of request.body || []) {
    size += chunk.byteLength;
    if (size > 4096) fail(413, "size", "This confirmation is too large.");
    chunks.push(chunk);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if (
    form.getAll("token").length !== 1 ||
    [...form.keys()].some((k) => !["token", "destination"].includes(k))
  )
    fail(400, "form", "Use the sign-in confirmation form.");
  return form;
}
