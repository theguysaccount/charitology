import path from "node:path";
import { prepareObservationInputs } from "../src/lib/observation-capture-io.mjs";

const args = process.argv.slice(2),
  values = {};
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (name === "--download") {
    if (values.download) throw Error("Duplicate --download");
    values.download = true;
  } else if (["--repo", "--from-retained-root", "--out"].includes(name)) {
    if (
      values[name] !== undefined ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw Error("Missing/duplicate option " + name);
    values[name] = args[++i];
  } else throw Error("Unknown option " + name);
}
if (!values["--out"])
  throw Error(
    "Usage: node scripts/prepare-observations.mjs --out PRIVATE_DIRECTORY (--from-retained-root PRIVATE_ORIGINALS | --download) [--repo PATH]",
  );
const result = await prepareObservationInputs({
  repo: path.resolve(values["--repo"] ?? "."),
  outputRoot: values["--out"],
  retainedRoot: values["--from-retained-root"] ?? null,
  download: values.download ?? false,
});
console.log(JSON.stringify(result, null, 2));
