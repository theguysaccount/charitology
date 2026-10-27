import ts from "typescript";
import path from "node:path";
import { readFileSync } from "node:fs";
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const options = {
  ...parsed.options,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  noEmit: true,
};
const virtual = new Map();
for (const file of [
  "src/components/ArtifactResults.astro",
  "src/components/programs/methods-lab.astro",
  "src/components/programs/replication-program.astro",
]) {
  const source = readFileSync(file, "utf8");
  let index = 0;
  for (const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g))
    virtual.set(
      path.resolve(file) + `.inline-${index++}.ts`,
      match[1] + "\nexport {};\n",
    );
}
const host = ts.createCompilerHost(options);
const get = host.getSourceFile.bind(host),
  exists = host.fileExists.bind(host),
  read = host.readFile.bind(host);
host.getSourceFile = (name, language, onError, create) =>
  virtual.has(name)
    ? ts.createSourceFile(name, virtual.get(name), language, true)
    : get(name, language, onError, create);
host.fileExists = (name) => virtual.has(name) || exists(name);
host.readFile = (name) => virtual.get(name) ?? read(name);
const roots = [
  ...virtual.keys(),
  ...[
    "src/lib/client/artifact-results-model.ts",
    "src/lib/client/artifact-results-import.ts",
    "src/lib/client/artifact-results-store.ts",
    "src/lib/client/artifact-results-ui.ts",
    "src/lib/client/artifact-results-ui-helpers.ts",
    "src/data/research-artifact-adapters.ts",
    "node_modules/astro/client.d.ts",
    ".astro/types.d.ts",
  ].map((file) => path.resolve(file)),
];
const program = ts.createProgram(roots, options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
for (const d of diagnostics) {
  const pos =
    d.file && d.start != null
      ? d.file.getLineAndCharacterOfPosition(d.start)
      : null;
  console.log(
    `${d.file?.fileName || ""}:${pos ? pos.line + 1 : ""} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
  );
}
console.log(
  `Strict artifact-results TypeScript: actual model/import/store/UI/adapters and ${virtual.size} inline scripts; ${diagnostics.length} diagnostics.`,
);
if (diagnostics.length) process.exitCode = 1;
