import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { attendanceWorksheetHtml, readAttendanceWorksheet } from "./attendance-worksheet.js";

test("the generated offline HTML saves a sealed zero and leaves blank counts unknown", async () => {
  const packet = {
    format: "charitology-os-offline-events-attendance", version: 1, packetId: "a".repeat(32),
    coverage: "whole-occurrence", issueSeal: "a".repeat(43),
    occurrence: { moduleId: "events", kind: "session", startAt: "2026-01-01T12:00:00Z", endAt: "2026-01-01T14:00:00Z", timeZone: "UTC" },
    counts: { reportedAttendance: null, registeredCount: null, walkInCount: null },
  };
  const packetBase64 = Buffer.from(JSON.stringify(packet)).toString("base64");
  const html = attendanceWorksheetHtml({ ok: true, kind: "offline-worksheet", packetBase64 });
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script src=|fetch\(|<link rel=/);
  assert.throws(() => attendanceWorksheetHtml({ ok: true, kind: "offline-worksheet", packetBase64: packetBase64 + '"' }));
  const inputs = Object.fromEntries(Object.keys(packet.counts).map(key => [key, { value: "", validity: { badInput: false }, focus() {} }]));
  const status = {}, schedule = {}, downloads = [], removed = [];
  let submit, suggestedName;
  const document = {
    querySelector: () => ({ content: packetBase64 }),
    getElementById: id => ({...inputs, schedule, status, attendance: { addEventListener(type, listener) { assert.equal(type, "submit");submit=listener; } }})[id],
    createElement: tag => {
      assert.equal(tag, "a");
      return { click() { suggestedName=this.download; }, remove() {} };
    },
    body: { append() {} },
  };
  runInNewContext(html.match(/<script>([\s\S]+)<\/script>/)[1], {
    document, TextDecoder, Blob, Uint8Array, atob, setTimeout: fn => fn(),
    URL: { createObjectURL: blob => { downloads.push(blob); return "blob:fictional"; }, revokeObjectURL: url => removed.push(url) },
  });
  inputs.reportedAttendance.value = "0";
  inputs.walkInCount.value = "1.5";
  submit({ preventDefault() {} });
  assert.equal(downloads.length, 0);
  assert.match(status.textContent, /whole number/);
  inputs.walkInCount.value = "";
  submit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(await downloads[0].text()), { ...packet, counts: { ...packet.counts, reportedAttendance: 0 } });
  assert.equal(suggestedName, "charity-os-attendance-aaaaaaaa.json");
  assert.deepEqual(removed, ["blob:fictional"]);
  assert.match(schedule.textContent, /2026-01-01T12:00:00Z.*UTC/);
});

test("worksheet file recovery preserves the exact original bytes and rejects oversized files before reading", async () => {
  const raw = Uint8Array.from([0xef,0xbb,0xbf,0xff,0x0a]);
  const file = await readAttendanceWorksheet(new File([raw], "fictional-failed.json"));
  assert.equal(file.packetBase64, Buffer.from(raw).toString("base64"));
  assert.deepEqual(new Uint8Array(await file.original().arrayBuffer()), raw);
  await assert.rejects(readAttendanceWorksheet({
    size: 2049, arrayBuffer() { throw Error("An oversized file should never be read"); },
  }), /up to 2 KiB/);
});
