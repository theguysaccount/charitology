import path from "node:path";
import { strictObservationJson } from "../src/lib/observation-canonical.mjs";
import {
  previewObservationCapture,
  writeReviewedObservationCapture,
  readBoundedObservationFile,
} from "../src/lib/observation-capture-io.mjs";

const args = process.argv.slice(2),
  values = {};
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (
    !["--repo", "--prepared", "--request", "--write-reviewed-hash"].includes(
      name,
    ) ||
    values[name] !== undefined ||
    !args[i + 1] ||
    args[i + 1].startsWith("--")
  )
    throw Error("Unknown, duplicate or incomplete option " + name);
  values[name] = args[++i];
}
if (!values["--request"] || !values["--prepared"])
  throw Error(
    "Usage: node scripts/capture-observations.mjs --request REQUEST.json --prepared PRIVATE_DIRECTORY [--repo PATH] [--write-reviewed-hash EXACT_PREVIEW_SHA256]",
  );
const requestFile = path.resolve(values["--request"]);
const request = strictObservationJson(
  readBoundedObservationFile(requestFile, 2 * 1024 * 1024),
);
const preview = await previewObservationCapture({
  repo: path.resolve(values["--repo"] ?? "."),
  preparedRoot: path.resolve(values["--prepared"]),
  request,
});
if (values["--write-reviewed-hash"])
  console.log(
    JSON.stringify(
      await writeReviewedObservationCapture(
        preview,
        values["--write-reviewed-hash"],
      ),
      null,
      2,
    ),
  );
else console.log(JSON.stringify(preview, null, 2));
