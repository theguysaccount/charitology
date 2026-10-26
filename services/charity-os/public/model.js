export const blank = (value) =>
  value === null || value === undefined || value === "";
export const recordTitle = (record) =>
  String(
    record?.data?.title ||
      record?.data?.name ||
      record?.title ||
      "Untitled record",
  );
export const labelFor = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (ch) => ch.toUpperCase());
export const optionsFor = (field) =>
  (field.options || []).map((option) =>
    typeof option === "string"
      ? { value: option, label: labelFor(option) }
      : option,
  );
export function can(module, action, role) {
  return (
    Array.isArray(module?.roles?.[action]) &&
    module.roles[action].includes(role)
  );
}
export function stateLabel(module, status) {
  return (
    module.workflow?.states?.find((s) => s.id === status)?.label ||
    labelFor(status) ||
    "Unknown"
  );
}
export function permittedTransitions(module, record, role) {
  return (module.workflow?.transitions || []).filter(
    (t) =>
      (t.from === record.status || t.from === "*") && t.roles?.includes(role),
  );
}
export function moneyFromMajor(raw, currency, precision) {
  if (String(raw).trim() === "") return null;
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Use a three-letter uppercase currency code.");
  if (!Number.isInteger(precision) || precision < 0 || precision > 4)
    throw new Error("Currency precision must be a whole number from 0 to 4.");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(raw).trim());
  if (!match || (match[3] || "").length > precision)
    throw new Error(
      `Enter an amount with no more than ${precision} decimal places.`,
    );
  const magnitude =
    BigInt(match[2]) * 10n ** BigInt(precision) +
    BigInt((match[3] || "").padEnd(precision, "0") || "0");
  const integer = magnitude * (match[1] ? -1n : 1n);
  if (
    integer > BigInt(Number.MAX_SAFE_INTEGER) ||
    integer < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("The amount is too large to store exactly.");
  return { minor: Number(integer), currency, precision };
}
export function moneyToMajor(value) {
  if (!value || value.minor === null || value.minor === undefined) return "";
  if (!Number.isSafeInteger(value.minor) || !Number.isInteger(value.precision))
    return "";
  const absolute = String(Math.abs(value.minor)).padStart(
    value.precision + 1,
    "0",
  );
  return `${value.minor < 0 ? "-" : ""}${value.precision ? `${absolute.slice(0, -value.precision)}.${absolute.slice(-value.precision)}` : absolute}`;
}
export function formatMoney(value) {
  if (!value || value.minor === null) return "Unknown";
  const amount = moneyToMajor(value);
  return amount === "" ? "Invalid amount" : `${value.currency} ${amount}`;
}
export function formatDate(value, withTime = false) {
  if (blank(value)) return "Not recorded";
  if (!withTime && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
      : {}),
  }).format(date);
}
export function formatValue(field, value, references = new Map()) {
  if (blank(value)) return "Not recorded";
  if (field.type === "money") return formatMoney(value);
  if (field.type === "boolean")
    return value === true ? "Yes" : value === false ? "No" : "Unknown";
  if (field.type === "date" || field.type === "datetime")
    return formatDate(value, field.type === "datetime");
  if (field.type === "select")
    return (
      optionsFor(field).find((o) => o.value === value)?.label || String(value)
    );
  if (field.type === "reference")
    return references.get(String(value)) || String(value);
  if (field.type === "references")
    return Array.isArray(value) && value.length
      ? value.map((id) => references.get(String(id)) || id).join(", ")
      : "None recorded";
  return String(value);
}
export function filterRecords(
  records,
  { query = "", status = "", owner = "", sort = "updated" } = {},
) {
  const q = query.trim().toLocaleLowerCase();
  return records
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!owner ||
          (owner === "unassigned" ? !r.ownerId : r.ownerId === owner)) &&
        (!q ||
          `${recordTitle(r)} ${r.id} ${JSON.stringify(r.data || {})}`
            .toLocaleLowerCase()
            .includes(q)),
    )
    .sort((a, b) =>
      sort === "title"
        ? recordTitle(a).localeCompare(recordTitle(b))
        : sort === "oldest"
          ? String(a.createdAt).localeCompare(String(b.createdAt))
          : String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
}
export function csvCell(value) {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s\uFEFF]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function recordsCsv(module, records) {
  const fields = module.fields || [];
  return [
    [
      "id",
      "status",
      "ownerId",
      "revision",
      "createdAt",
      "updatedAt",
      ...fields.map((f) => f.key),
    ],
    ...records.map((r) => [
      r.id,
      r.status,
      r.ownerId,
      r.revision,
      r.createdAt,
      r.updatedAt,
      ...fields.map((f) => r.data?.[f.key]),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
export function calendarCells(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      current: d.getUTCMonth() === month,
    };
  });
}
export function safeFilename(value) {
  return String(value || "charity-os")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 100);
}
export function parseCsv(text, limit = 1000) {
  if (typeof text !== "string") throw new Error("Choose a text CSV file.");
  text = text.replace(/^\uFEFF/, "");
  const table = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell !== "" || closed)
        throw new Error("The CSV has an unexpected quote.");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v !== "")) table.push(row);
      row = [];
      cell = "";
      closed = false;
      if (table.length > limit + 1)
        throw new Error(`Import at most ${limit} rows at a time.`);
    } else {
      if (closed && !/\s/.test(c))
        throw new Error("The CSV has text after a closing quote.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted value.");
  row.push(cell);
  if (row.some((v) => v !== "")) table.push(row);
  if (table.length < 2)
    throw new Error("Use a header row and at least one data row.");
  if (table.length > limit + 1)
    throw new Error(`Import at most ${limit} rows at a time.`);
  const headers = table.shift().map((v) => v.trim());
  if (
    headers.some(
      (v) => !v || ["__proto__", "prototype", "constructor"].includes(v),
    ) ||
    new Set(headers).size !== headers.length
  )
    throw new Error(
      "CSV headers must be nonempty, unique and safe field names.",
    );
  return table.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(
        `CSV row ${index + 2} has ${values.length} cells; the header has ${headers.length}.`,
      );
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}
export function typedCsvRows(rows, fieldMap, module) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const field = module?.fields?.find((f) => f.key === fieldMap?.[key]);
        if (!field) return [key, value];
        const text = String(value).trim();
        if (text === "") return [key, null];
        if (
          ["number", "integer"].includes(field.type) &&
          /^[+-]?\d+(?:\.\d+)?$/.test(text)
        )
          return [key, Number(text)];
        if (
          field.type === "boolean" &&
          ["true", "false"].includes(text.toLowerCase())
        )
          return [key, text.toLowerCase() === "true"];
        if (["money", "references"].includes(field.type)) {
          try {
            return [key, JSON.parse(text)];
          } catch {}
        }
        return [key, value];
      }),
    ),
  );
}
