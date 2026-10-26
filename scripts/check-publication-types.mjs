// Strict-check executable publication scripts, excluding the separate application/json element.
// Run from the repository root after npm ci.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.resolve("package.json"));
const ts = require("typescript");
const files = [
  "src/components/NewsletterSignup.astro",
  "src/pages/for-charities/os-plan.astro",
  "src/components/DepthCensus.astro",
  "src/components/ReaderNotebook.astro",
  ...[
    "country-profiles",
    "charitology-100",
    "journal",
    "principles",
    "lexicon",
    "state-of-charity",
    "cause-atlas",
  ].map((s) => `src/components/record/${s}.astro`),
];
const virtual = new Map(),
  offsets = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const rx = /<script>([\s\S]*?)<\/script>/g;
  let match,
    index = 0;
  while ((match = rx.exec(source))) {
    if (/type=["']application\/json/.test(match[0].split(">")[0])) continue;
    const name = `${path.resolve(file)}.inline-${index++}.ts`;
    virtual.set(name, `${match[1]}\nexport {};`);
    offsets.set(name, {
      file,
      line:
        source.slice(0, match.index + match[0].indexOf(">") + 1).split("\n")
          .length - 1,
    });
  }
}
const read = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  read.config,
  ts.sys,
  process.cwd(),
);
const options = {
  ...parsed.options,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  noEmit: true,
};
const host = ts.createCompilerHost(options),
  get = host.getSourceFile.bind(host),
  exists = host.fileExists.bind(host),
  readFile = host.readFile.bind(host);
host.getSourceFile = (name, language, onError, create) =>
  virtual.has(name)
    ? ts.createSourceFile(name, virtual.get(name), language, true)
    : get(name, language, onError, create);
host.fileExists = (name) => virtual.has(name) || exists(name);
host.readFile = (name) => virtual.get(name) ?? readFile(name);
const roots = [
  ...virtual.keys(),
  ...[
    "src/lib/client/completion-models.ts",
    "src/lib/client/guarded-draft.ts",
    "node_modules/astro/client.d.ts",
  ].map((file) => path.resolve(file)),
];
const program = ts.createProgram(roots, options, host),
  diagnostics = ts.getPreEmitDiagnostics(program);
for (const d of diagnostics) {
  let location = "";
  if (d.file && d.start != null) {
    const pos = d.file.getLineAndCharacterOfPosition(d.start),
      offset = offsets.get(d.file.fileName);
    location = offset
      ? `${offset.file}:${offset.line + pos.line + 1}:${pos.character + 1}`
      : `${path.relative(process.cwd(), d.file.fileName)}:${pos.line + 1}:${pos.character + 1}`;
  }
  console.log(
    `${location} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
  );
}
console.log(
  `Strict TypeScript: ${virtual.size} inline modules plus completion-models and guarded-draft; ${diagnostics.length} diagnostics.`,
);
if (diagnostics.length) process.exitCode = 1;
