/** Deterministic actual native TS admission. --check writes nothing. */
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const result = await build({
  absWorkingDir: repo,
  entryPoints: ["services/charity-os/lib/learning-native-entry.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  metafile: true,
  legalComments: "inline",
  charset: "utf8",
  logLevel: "silent",
});
const bytes = result.outputFiles[0].contents;
if (/(?:node:|\bimport\s*\()/u.test(new TextDecoder().decode(bytes)))
  throw Error(
    "Native admission bundle must remain browser-compatible with no computed imports.",
  );
const inputs = [];
for (const name of Object.keys(result.metafile.inputs).sort()) {
  const raw = await fs.readFile(path.join(repo, name));
  inputs.push({ path: name, byteLength: raw.length, sha256: hash(raw) });
}
const manifest = {
  format: "charitology-learning-native-admission",
  version: 1,
  sourceFiles: inputs,
  bundle: { byteLength: bytes.length, sha256: hash(bytes) },
};
const outputs = new Map([
  ["services/charity-os/lib/learning-native-admission.mjs", bytes],
  ["services/charity-os/public/learning-native-admission.js", bytes],
  [
    "services/charity-os/lib/learning-native-manifest.json",
    Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
  ],
]);
for (const [name, data] of outputs) {
  const dest = path.join(repo, name);
  if (process.argv.includes("--check")) {
    let old;
    try {
      old = await fs.readFile(dest);
    } catch {
      throw Error("Missing generated native admission: " + name);
    }
    if (!Buffer.from(data).equals(old))
      throw Error("Generated native admission differs: " + name);
  } else await fs.writeFile(dest, data);
}
console.log(
  `Learning native admission ${process.argv.includes("--check") ? "checked" : "generated"}: ${bytes.length} bytes, ${inputs.length} actual source/dependency files.`,
);
