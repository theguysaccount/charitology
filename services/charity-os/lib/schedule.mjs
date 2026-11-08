/** Shared strict schedule admission; no persistence or authority. */
export function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^(19|20|21|22)\d{2}-\d{2}-\d{2}$/.test(value)
  )
    return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(+d) &&
    d.toISOString().slice(0, 10) === value &&
    +value.slice(0, 4) <= 2200
  );
}
export function validZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return typeof value === "string" && value.length <= 100;
  } catch {
    return false;
  }
}
export function validInstant(value) {
  if (typeof value !== "string") return false;
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/,
  );
  return (
    !!match &&
    validDate(match[1]) &&
    +match[2] < 24 &&
    +match[3] < 60 &&
    +match[4] < 60 &&
    (!match[6] ||
      (+match[6] <= 14 &&
        +match[7] < 60 &&
        (+match[6] < 14 || +match[7] === 0))) &&
    Number.isFinite(Date.parse(value))
  );
}
export function agreesWithZone(value, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((x) => [x.type, x.value]),
  );
  return (
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` ===
    value.slice(0, 19)
  );
}
