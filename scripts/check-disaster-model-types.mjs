// Actual JavaScript resolution + frozen DTO declarations; checkJs:false is not
// a claim of JavaScript static safety. Adversarial runtime checks are separate.
import ts from "typescript";
import path from "node:path";
import { readFileSync } from "node:fs";
const base = path.resolve("src/lib/disaster-incidents");
const spec = path.join(base, "model-contract-check.ts");
const frozen = path.join(base, "frozen-contract-check.ts");
const source = `import type {AdmittedHistory,Packet,Pin,CoveragePacket,Incident,FreshnessView,DeviceWarning} from './types';
import * as model from './model.mjs';
import * as formats from './formats.mjs';
import * as projection from './projection.mjs';
const admit:(files:ReadonlyMap<string,Uint8Array>)=>AdmittedHistory=model.admitHistory;
const prod:(files:ReadonlyMap<string,Uint8Array>)=>AdmittedHistory=model.admitProductionHistory;
const packet:(h:AdmittedHistory,e:Pin<'edition'>,i?:string)=>Packet=model.editionPacket;
const coverage:(h:AdmittedHistory,e:Pin<'edition'>)=>CoveragePacket=model.coveragePacket;
const json:(p:Packet)=>Uint8Array=formats.packetJSON;
const csv:(p:Packet)=>Uint8Array=formats.packetCSV;
const history:(h:AdmittedHistory)=>Uint8Array=model.historyJSON;
const freshness:(i:Incident,a:string)=>FreshnessView=projection.freshness;
const warning:(i:readonly Incident[],a:string,d:unknown)=>DeviceWarning=projection.deviceWarning;
declare const e:Pin<'edition'>;
// @ts-expect-error A structural object cannot fabricate an admitted capability.
model.editionPacket({},e);
// @ts-expect-error Wrong pin kind cannot select an edition.
model.editionPacket(admit(new Map()),{kind:'source',id:'source',version:1,hash:'0'});
export {};
`;
const virtual = new Map([
  [spec, source],
  [
    frozen,
    readFileSync("docs/DISASTER_DESK_INTERFACES.md", "utf8")
      .split("```ts\n")[1]
      .split("\n```")[0],
  ],
]);
const options = {
  strict: true,
  allowJs: true,
  checkJs: false,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
};
const host = ts.createCompilerHost(options),
  oldGet = host.getSourceFile.bind(host),
  oldExists = host.fileExists.bind(host),
  oldRead = host.readFile.bind(host);
host.getSourceFile = (name, language, onError, create) =>
  virtual.has(name)
    ? ts.createSourceFile(name, virtual.get(name), language, true)
    : oldGet(name, language, onError, create);
host.fileExists = (name) => virtual.has(name) || oldExists(name);
host.readFile = (name) => virtual.get(name) ?? oldRead(name);
const actual = [
  "types.ts",
  "model.mjs",
  "formats.mjs",
  "projection.mjs",
  "canonical.mjs",
  "limits.mjs",
  "interpretations/v1/canonical.mjs",
  "interpretations/v1/schema.mjs",
  "interpretations/v1/runtime.mjs",
  "interpretations/v1/limits.mjs",
].map((p) => path.join(base, p));
const p = ts.createProgram([...actual, ...virtual.keys()], options, host);
for (const file of actual)
  if (!p.getSourceFile(file))
    throw Error(`Actual module not resolved: ${file}`);
const diagnostics = ts.getPreEmitDiagnostics(p);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (n) => n,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    "Disaster actual pure facade + frozen DTO strict compile: zero diagnostics (no module declaration shims).",
  );
