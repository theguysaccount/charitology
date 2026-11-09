import { request } from "./api.js";

export function resourceReservationsAPI(orgId) {
  if (typeof orgId !== "string" || orgId.length < 1 || orgId.length > 100 ||
      /[^A-Za-z0-9_-]/.test(orgId)) throw new TypeError("Choose a current organization.");
  const base = "/api/orgs/" + encodeURIComponent(orgId) + "/resource-reservations";
  const post = (path, body, options) => request(base + path, { ...options, method: "POST", body });
  return Object.freeze({
    workspace: options => request(base + "/workspace", options),
    review: (body, options) => post("/review", body, options),
    commit: (body, options) => post("/commit", body, options),
  });
}
