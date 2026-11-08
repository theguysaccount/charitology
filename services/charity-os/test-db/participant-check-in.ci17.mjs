/** Explicit closed PG17 entry; excluded from the legacy *.test.mjs glob. */
import { after } from "node:test";
import { createCheckInCi17Profile } from "./fixtures/participant-check-in-ci17-profile.mjs";

let profile, registered = false;
try {
  profile = await createCheckInCi17Profile();
  const { makeParticipantCheckInFixture } = await import("./fixtures/participant-check-in.mjs");
  const { registerParticipantCheckInCases } = await import("./fixtures/participant-check-in-cases.mjs");
  const names = registerParticipantCheckInCases(makeParticipantCheckInFixture(profile));
  if (names.length !== 13 || new Set(names).size !== 13 || names.some((name, i) => !name.startsWith(`checkin PG${String(i + 1).padStart(2, "0")}:`))) throw Error("CHECKIN_CI17_CASE_SET");
  after(async () => {
    try { process.stdout.write(JSON.stringify(await profile.finish()) + "\n"); }
    catch { throw Error("CHECKIN_CI17_FINAL_REFUSAL"); }
  });
  registered = true;
} catch {
  if (profile && !registered) await profile.abandon();
  process.stderr.write("CHECKIN_CI17_PRETEST_REFUSAL\n");
  process.exitCode = 1;
}
