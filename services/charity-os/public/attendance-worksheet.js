const WORKSHEET_BYTES = 2048;
const WORKSHEET_FORMAT = "charitology-os-offline-events-attendance";

function base64Bytes(value) {
  if (typeof value !== "string" || !value.length || value.length > 4 * Math.ceil(WORKSHEET_BYTES / 3))
    throw new Error("The worksheet download could not be verified.");
  const binary = atob(value);
  if (binary.length > WORKSHEET_BYTES || btoa(binary) !== value)
    throw new Error("The worksheet download could not be verified.");
  return Uint8Array.from(binary, letter => letter.charCodeAt(0));
}

export async function readAttendanceWorksheet(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > WORKSHEET_BYTES)
    throw new Error("Choose one JSON worksheet up to 2 KiB. Your original file is kept.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("This file changed while it was being read. Choose it again.");
  const packetBase64 = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fileSha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  return Object.freeze({
    packetBase64,
    fileSha256,
    original: () => new Blob([bytes], { type: "application/json" }),
  });
}

export function saveAttendanceWorksheet(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export function attendanceWorksheetHtml(response) {
  if (response?.ok !== true || response.kind !== "offline-worksheet")
    throw new Error("The worksheet download could not be verified.");
  const { packetBase64 } = response;
  const packet = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(base64Bytes(packetBase64)));
  if (packet?.format !== WORKSHEET_FORMAT || packet.version !== 1 ||
      !/^[a-f0-9]{32}$/.test(packet.packetId ?? "") ||
      typeof packet.issueSeal !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(packet.issueSeal) ||
      packet.occurrence?.moduleId !== "events" || packet.occurrence.kind !== "session" ||
      !["reportedAttendance", "registeredCount", "walkInCount"].every(key => packet.counts?.[key] === null))
    throw new Error("The blank Events worksheet could not be verified.");
  const script = "(" + runOfflineWorksheet.toString() + ")();";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="worksheet" content="${packetBase64}">
<title>Charity OS attendance worksheet</title>
<style>html{color-scheme:light dark}body{font:1.06rem system-ui,sans-serif;line-height:1.55;max-width:38rem;margin:auto;padding:1.3rem}label{display:block;margin:.85rem 0}input,button{font:inherit;padding:.45rem}input{display:block;max-width:100%;box-sizing:border-box}button{margin-top:.35rem}</style>
</head><body>
<h1>Record whole-event attendance</h1>
<p id="schedule"></p>
<p>Use 0 when you counted zero people. Leave a box blank when you lack the count. Keep the worksheet to totals for the whole event.</p>
<form id="attendance">
<label>Total attendance<input id="reportedAttendance" type="number" min="0" max="1000000000" step="1" inputmode="numeric"></label>
<label>Total registrations (optional)<input id="registeredCount" type="number" min="0" max="1000000000" step="1" inputmode="numeric"></label>
<label>Walk-ins (optional)<input id="walkInCount" type="number" min="0" max="1000000000" step="1" inputmode="numeric"></label>
<button type="submit">Save worksheet JSON</button>
</form>
<p id="status" role="status">When you are online, open the same event in Charity OS and review the saved JSON file.</p>
<noscript>Enable JavaScript to save the worksheet from this offline page.</noscript>
<script>${script}</script>
</body></html>`;
}

function runOfflineWorksheet() {
  const encoded = document.querySelector('meta[name="worksheet"]').content;
  const packet = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(encoded), letter => letter.charCodeAt(0)),
  ));
  const { startAt, endAt, timeZone } = packet.occurrence;
  document.getElementById("schedule").textContent = startAt + " to " + endAt + " · " + timeZone;
  const status = document.getElementById("status");
  document.getElementById("attendance").addEventListener("submit", event => {
    event.preventDefault();
    const counts = {};
    for (const key of ["reportedAttendance", "registeredCount", "walkInCount"]) {
      const field = document.getElementById(key);
      if (field.validity.badInput || (field.value !== "" && !/^[0-9]{1,10}$/.test(field.value))) {
        status.textContent = "Enter a whole number from 0 through 1,000,000,000 or leave the box blank.";
        field.focus();
        return;
      }
      const count = field.value === "" ? null : Number(field.value);
      if (count !== null && count > 1000000000) {
        status.textContent = "Use at most 1,000,000,000 in each box.";
        field.focus();
        return;
      }
      counts[key] = count;
    }
    const blob = new Blob([JSON.stringify({ ...packet, counts }, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "charity-os-attendance-" + packet.packetId.slice(0, 8) + ".json";
    document.body.append(anchor);
    try { anchor.click(); }
    finally {
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    status.textContent = "Your browser has the worksheet download. Keep this JSON and review it in Charity OS when you are online.";
  });
}
