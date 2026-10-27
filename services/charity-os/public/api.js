export class ApiError extends Error {
  constructor(message, status = 0, code = "request_failed", issues = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}
let csrfToken = "";
export function setCsrfToken(value) {
  csrfToken = typeof value === "string" ? value : "";
}
const part = (value) => encodeURIComponent(String(value));
const orgPath = (org) => `/api/orgs/${part(org)}`;
const recordsPath = (org, module) =>
  `${orgPath(org)}/modules/${part(module)}/records`;
export async function request(path, { method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: signal || AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      method === "GET"
        ? "The service could not be reached. Check your connection and try again."
        : "The response was interrupted. The operation may have completed. Reload the saved records before trying again.",
      0,
      "connection_interrupted",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The service returned an unreadable response. Your form has been kept open.",
      response.status,
      "invalid_response",
    );
  }
  if (!response.ok || data.ok === false)
    throw new ApiError(
      data.message || "The request could not be completed.",
      response.status,
      data.code || "request_failed",
      data.issues || [],
    );
  return data;
}
export async function requestFile(path) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ApiError(
      "The export could not be downloaded. Check your connection and try again.",
      0,
      "connection_interrupted",
    );
  }
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {}
    throw new ApiError(
      data?.message || "The export could not be downloaded.",
      response.status,
      data?.code,
    );
  }
  return response.blob();
}
export const api = {
  session: () => request("/api/session"),
  modules: () => request("/api/modules"),
  signIn: (email) =>
    request("/api/auth/request-link", { method: "POST", body: { email } }),
  logout: () => request("/api/auth/logout", { method: "POST", body: {} }),
  acceptInvitation: (token) =>
    request("/api/invitations/accept", { method: "POST", body: { token } }),
  orgs: () => request("/api/orgs"),
  createOrg: (data) => request("/api/orgs", { method: "POST", body: data }),
  org: (org) => request(orgPath(org)),
  dashboard: (org) => request(`${orgPath(org)}/dashboard`),
  updateOrg: (org, data) =>
    request(orgPath(org), { method: "PATCH", body: data }),
  records: (org, module, cursor) =>
    request(
      `${recordsPath(org, module)}${cursor ? `?cursor=${part(cursor)}` : ""}`,
    ),
  record: (org, module, id) =>
    request(`${recordsPath(org, module)}/${part(id)}`),
  createRecord: (org, module, data) =>
    request(recordsPath(org, module), { method: "POST", body: data }),
  updateRecord: (org, module, id, data) =>
    request(`${recordsPath(org, module)}/${part(id)}`, {
      method: "PATCH",
      body: data,
    }),
  taskRecurrence: (org, id) =>
    request(`${orgPath(org)}/task-recurrence/tasks/${part(id)}`),
  previewTaskRecurrence: (org, id, body) =>
    request(`${orgPath(org)}/task-recurrence/tasks/${part(id)}/preview`, {
      method: "POST",
      body,
    }),
  generateTaskRecurrence: (org, id, body) =>
    request(`${orgPath(org)}/task-recurrence/tasks/${part(id)}/generate`, {
      method: "POST",
      body,
    }),
  endTaskRecurrence: (org, id, body) =>
    request(`${orgPath(org)}/task-recurrence/series/${part(id)}/end`, {
      method: "POST",
      body,
    }),
  trashRecords: (org, module) =>
    request(`${orgPath(org)}/modules/${part(module)}/trash`),
  restoreRecord: (org, module, id, revision) =>
    request(`${recordsPath(org, module)}/${part(id)}/restore`, {
      method: "POST",
      body: { revision },
    }),
  importArchives: (org) => request(`${orgPath(org)}/backups/imports`),
  importArchive: (org, id) =>
    request(`${orgPath(org)}/backups/imports/${part(id)}`),
  deleteRecord: (org, module, id, revision) =>
    request(`${recordsPath(org, module)}/${part(id)}`, {
      method: "DELETE",
      body: { revision },
    }),
  transition: (org, module, id, data) =>
    request(`${recordsPath(org, module)}/${part(id)}/transition`, {
      method: "POST",
      body: data,
    }),
  approve: (org, module, id, data) =>
    request(`${recordsPath(org, module)}/${part(id)}/approve`, {
      method: "POST",
      body: data,
    }),
  comment: (org, module, id, body) =>
    request(`${recordsPath(org, module)}/${part(id)}/comments`, {
      method: "POST",
      body: { body },
    }),
  reminder: (org, module, id, at) =>
    request(`${recordsPath(org, module)}/${part(id)}/reminder`, {
      method: "POST",
      body: { at },
    }),
  files: (org, module, id) =>
    request(`${recordsPath(org, module)}/${part(id)}/files`),
  attachFile: (org, module, id, data) =>
    request(`${recordsPath(org, module)}/${part(id)}/files`, {
      method: "POST",
      body: data,
    }),
  downloadFile: (org, id) => requestFile(`${orgPath(org)}/files/${part(id)}`),
  members: (org) => request(`${orgPath(org)}/members`),
  invite: (org, data) =>
    request(`${orgPath(org)}/invitations`, { method: "POST", body: data }),
  updateMember: (org, id, data) =>
    request(`${orgPath(org)}/members/${part(id)}`, {
      method: "PATCH",
      body: data,
    }),
  removeMember: (org, id) =>
    request(`${orgPath(org)}/members/${part(id)}`, {
      method: "DELETE",
      body: {},
    }),
  revokeInvitation: (org, id) =>
    request(`${orgPath(org)}/invitations/${part(id)}`, {
      method: "DELETE",
      body: {},
    }),
  reports: (org) => request(`${orgPath(org)}/reports`),
  freezeReport: (org, data) =>
    request(`${orgPath(org)}/reports`, { method: "POST", body: data }),
  report: (org, id) => request(`${orgPath(org)}/reports/${part(id)}`),
  exportOrg: (org) => request(`${orgPath(org)}/export`),
  exportModule: (org, module) =>
    request(`${orgPath(org)}/modules/${part(module)}/export`),
  exportModuleCsv: (org, module) =>
    requestFile(`${orgPath(org)}/modules/${part(module)}/export?format=csv`),
  previewImport: async (org, data) => {
    if (!data.backup)
      return request(`${orgPath(org)}/import/preview`, {
        method: "POST",
        body: data,
      });
    const bytes = new TextEncoder().encode(JSON.stringify(data.backup));
    if (bytes.length <= 1500000)
      return request(`${orgPath(org)}/import/preview`, {
        method: "POST",
        body: data,
      });
    if (bytes.length > 64 * 1024 * 1024)
      throw new ApiError("Backups must be under64 MiB.", 413, "size");
    const total = Math.ceil(bytes.length / 1500000);
    let uploadId;
    for (let index = 0; index < total; index++) {
      const part = bytes.subarray(index * 1500000, (index + 1) * 1500000),
        pieces = [];
      for (let i = 0; i < part.length; i += 8192)
        pieces.push(String.fromCharCode(...part.subarray(i, i + 8192)));
      const result = await request(`${orgPath(org)}/import/upload`, {
        method: "POST",
        body: { uploadId, index, total, chunk: btoa(pieces.join("")) },
      });
      uploadId = result.uploadId;
    }
    return request(`${orgPath(org)}/import/preview`, {
      method: "POST",
      body: { uploadId },
    });
  },
  commitImport: (org, data) =>
    request(`${orgPath(org)}/import/commit`, { method: "POST", body: data }),
  intakePublications: (org) => request(`${orgPath(org)}/intake/publications`),
  publishIntake: (org, body) =>
    request(`${orgPath(org)}/intake/publications`, { method: "POST", body }),
  withdrawIntake: (org, id) =>
    request(`${orgPath(org)}/intake/publications/${part(id)}/withdraw`, {
      method: "POST",
      body: {},
    }),
  intakeSubmissions: (org, filters = {}) => {
    const query = new URLSearchParams(
      Object.entries(filters).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined,
      ),
    );
    return request(
      `${orgPath(org)}/intake/submissions${query.size ? `?${query}` : ""}`,
    );
  },
  intakeSubmission: (org, id) =>
    request(`${orgPath(org)}/intake/submissions/${part(id)}`),
  reviewIntake: (org, id, body) =>
    request(`${orgPath(org)}/intake/submissions/${part(id)}/review`, {
      method: "POST",
      body,
    }),
  integrations: (org) => request(`${orgPath(org)}/integrations`),
  createIntegration: (org, data) =>
    request(`${orgPath(org)}/integrations`, { method: "POST", body: data }),
  updateIntegration: (org, id, data) =>
    request(`${orgPath(org)}/integrations/${part(id)}`, {
      method: "PATCH",
      body: data,
    }),
  disableIntegration: (org, id, revision) =>
    request(`${orgPath(org)}/integrations/${part(id)}`, {
      method: "DELETE",
      body: { revision },
    }),
  testIntegration: (org, id) =>
    request(`${orgPath(org)}/integrations/${part(id)}/test`, {
      method: "POST",
      body: {},
    }),
  previewIntegration: (org, id, body = {}) =>
    request(`${orgPath(org)}/integrations/${part(id)}/preview`, {
      method: "POST",
      body,
    }),
  importIntegration: (org, id, previewId) =>
    request(`${orgPath(org)}/integrations/${part(id)}/import`, {
      method: "POST",
      body: { previewId },
    }),
  audit: (org) => request(`${orgPath(org)}/audit`),
};
export async function allRecords(org, module) {
  const records = [];
  const seen = new Set();
  let cursor;
  for (let page = 0; page < 100; page++) {
    const result = await api.records(org, module, cursor);
    if (!Array.isArray(result.records))
      throw new ApiError(
        "The record list is incomplete.",
        502,
        "invalid_response",
      );
    records.push(...result.records);
    if (!result.cursor) return records;
    if (seen.has(result.cursor))
      throw new ApiError(
        "Pagination stopped before the record list was complete. Refresh the list.",
        502,
        "pagination_conflict",
      );
    seen.add(result.cursor);
    cursor = result.cursor;
  }
  throw new ApiError(
    "This collection is too large to load in one view. Use an organization export.",
    413,
    "list_limit",
  );
}
