// Strict-check actual TypeScript and executable inline code. JavaScript modules
// participate in real resolution; checkJs:false is not a claim of JS type safety.
import ts from "typescript";
import path from "node:path";
import { readFileSync } from "node:fs";

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (config.error) {
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, " "),
  );
}
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
const options = {
  ...parsed.options,
  strict: true,
  allowJs: true,
  checkJs: false,
  noEmit: true,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
};
const virtual = new Map();
const offsets = new Map();
const inlineFiles = ["src/components/ResearchLedger.astro"];
for (const file of inlineFiles) {
  const source = readFileSync(file, "utf8");
  let index = 0;
  for (const match of source.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
  )) {
    const attributes = match[1];
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (
      type &&
      !["module", "text/javascript", "application/javascript"].includes(type)
    )
      continue;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const name = `${path.resolve(file)}.inline-${index++}.ts`;
    virtual.set(name, match[2] + "\nexport {};\n");
    const start = match.index + match[0].indexOf(">") + 1;
    offsets.set(name, {
      file,
      line: source.slice(0, start).split("\n").length - 1,
    });
  }
  if (index === 0)
    throw new Error(`No executable inline script found in ${file}.`);
}

const host = ts.createCompilerHost(options);
const getSourceFile = host.getSourceFile.bind(host);
const fileExists = host.fileExists.bind(host);
const readFile = host.readFile.bind(host);
host.getSourceFile = (name, language, onError, create) =>
  virtual.has(name)
    ? ts.createSourceFile(name, virtual.get(name), language, true)
    : getSourceFile(name, language, onError, create);
host.fileExists = (name) => virtual.has(name) || fileExists(name);
host.readFile = (name) => virtual.get(name) ?? readFile(name);

const implementationFiles = [
  "src/lib/research-ledger.ts",
  "src/lib/client/research-ledger-ui.ts",
  "src/lib/research-ledger-model.mjs",
  "src/lib/research-ledger-capture.mjs",
  "src/lib/research-ledger-canonical.mjs",
];
const roots = [
  ...virtual.keys(),
  ...implementationFiles.map((file) => path.resolve(file)),
  path.resolve("node_modules/astro/client.d.ts"),
  path.resolve(".astro/types.d.ts"),
];
const program = ts.createProgram(roots, options, host);
for (const file of implementationFiles) {
  if (!program.getSourceFile(path.resolve(file))) {
    throw new Error(`Actual ledger module was not resolved: ${file}`);
  }
}
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
for (const diagnostic of diagnostics) {
  const sourcePosition =
    diagnostic.file && diagnostic.start != null
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
  const offset = offsets.get(diagnostic.file?.fileName);
  const file = offset?.file ?? diagnostic.file?.fileName ?? "tsconfig.json";
  const line = sourcePosition
    ? sourcePosition.line + 1 + (offset?.line ?? 0)
    : "";
  const column = sourcePosition ? sourcePosition.character + 1 : "";
  console.log(
    `${file}:${line}:${column} TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
  );
}
console.log(
  `Strict research-ledger TypeScript: actual adapter, UI helper and ${virtual.size} executable inline script; ${diagnostics.length} diagnostics. Actual .mjs modules resolve with allowJs:true/checkJs:false; runtime validation and Astro compilation are separate checks.`,
);
if (diagnostics.length) process.exitCode = 1;
