import test from "node:test";
import assert from "node:assert/strict";
import {
  PILOT_FEEDBACK_RECIPIENT,
  PILOT_STARTER_TRACKS,
  buildPilotMailtoUrl,
  buildPilotGithubIssueUrl,
  selectAccessibleStarterTracks,
} from "./pilot-feedback.js";

test("selectAccessibleStarterTracks filters starter modules to only those readable by the active role", () => {
  const subset = [
    { id: "volunteers", title: "Volunteers" },
    { id: "events", title: "Events" },
  ];
  const tracks = selectAccessibleStarterTracks(subset);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].id, "volunteers");
  assert.deepEqual(
    tracks[0].accessibleModules.map((m) => m.id),
    ["volunteers", "events"],
  );
  assert.equal(PILOT_STARTER_TRACKS.length, 3);
});

test("buildPilotMailtoUrl and buildPilotGithubIssueUrl include non-sensitive screen context cleanly", () => {
  const mailto = buildPilotMailtoUrl({
    category: "missing_workflow",
    message: "Need recurring donor receipts note.",
    screen: "module/fundraising",
    viewport: "390x844",
    theme: "dark",
  });
  assert.ok(mailto.startsWith(`mailto:${PILOT_FEEDBACK_RECIPIENT}?subject=`));
  assert.ok(decodeURIComponent(mailto).includes("module/fundraising"));
  assert.ok(decodeURIComponent(mailto).includes("390x844"));

  const gh = buildPilotGithubIssueUrl({
    category: "bug",
    message: "Date picker clipped on mobile.",
    screen: "home",
    viewport: "320x780",
    theme: "light",
  });
  assert.ok(gh.startsWith("https://github.com/theguysaccount/charitology/issues/new?title="));
  assert.ok(decodeURIComponent(gh).includes("320x780"));
  assert.ok(decodeURIComponent(gh).includes("Something broke"));
});
