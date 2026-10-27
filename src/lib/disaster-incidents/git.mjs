// Maintainer-only, offline provenance. No command in this module writes Git or
// fetches missing objects. Data is admitted by the same production model as UI.
import { execFileSync } from "node:child_process";
import { constants, openSync, closeSync, readSync, fstatSync, lstatSync, opendirSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { admitProductionHistory, historyInventory, historyRegistry, interpretationFiles } from "./model.mjs";

export const DISASTER_ROOT = "src/data/disaster-incidents";
const COMMIT = /^[a-f0-9]{40}$/;
const MAX_PUBLIC = 80 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const sha = (v) => createHash("sha256").update(v).digest("hex");
const fail = (message) => { throw new Error(`Disaster provenance: ${message}`); };
const ordinary = (s) => s.isFile() && !s.isSymbolicLink() && s.nlink === 1;
const equal = (a, b) => a?.byteLength === b?.byteLength && Buffer.from(a).equals(Buffer.from(b));
const sameStat = (a,b) => a.dev===b.dev && a.ino===b.ino && a.ctimeNs===b.ctimeNs;
export function readBoundedWorkingFile(absolute, maximum = MAX_FILE) {
  const fd=openSync(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const before=fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.nlink!==1n||before.size>BigInt(maximum))fail("working file is not bounded ordinary single-link data");
    const chunks=[];let length=0;const block=Buffer.alloc(Math.min(65536,maximum+1));
    for(;;){const count=readSync(fd,block,0,Math.min(block.length,maximum-length+1),null);if(!count)break;length+=count;if(length>maximum)fail("working file grew beyond its bound");chunks.push(Buffer.from(block.subarray(0,count)));}
    const after=fstatSync(fd,{bigint:true}),atPath=lstatSync(absolute,{bigint:true});
    if(!after.isFile()||after.nlink!==1n||!atPath.isFile()||atPath.isSymbolicLink()||atPath.nlink!==1n||!sameStat(before,after)||!sameStat(after,atPath)||after.size!==BigInt(length))fail("working file identity or bytes changed during read");
    return Buffer.concat(chunks,length);
  } finally {closeSync(fd);}
}
// Offline public-loader guard. This establishes only absence of a pending
// local journal; historical/source authority remains the separate Git gate.
// It deliberately executes no Git command and has no installer bypass.
export function assertNoDisasterCaptureJournal(repo) {
  const root=realpathSync(repo),metadata=path.join(root,'.git');let stat;
  try{stat=lstatSync(metadata);}catch(error){if(error.code==='ENOENT')return;throw error;}
  let gitDirectory;
  if(stat.isDirectory()&&!stat.isSymbolicLink())gitDirectory=metadata;
  else if(stat.isFile()&&!stat.isSymbolicLink()){
    let value;try{value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readBoundedWorkingFile(metadata,4096));}catch{fail('unsafe offline Git pointer metadata');}
    const match=/^gitdir: ([^\r\n\x00]+)\n?$/.exec(value);if(!match)fail('unsupported offline Git pointer metadata');
    gitDirectory=path.resolve(root,match[1]);
  }else fail('unsafe offline Git metadata');
  const ordinaryDirectory=absolute=>{const s=lstatSync(absolute);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(absolute)!==path.resolve(absolute))fail('unsafe offline Git directory metadata');};
  ordinaryDirectory(gitDirectory);
  const privateDirectory=path.join(gitDirectory,'charitology-disasters');
  try{ordinaryDirectory(privateDirectory);}catch(error){if(error.code==='ENOENT')return;throw error;}
  try{lstatSync(path.join(privateDirectory,'journal.json'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  fail('pending local capture journal requires explicit reconciliation before public build');
}

// This reviewed list is code, never supplied by a proposal. Root integration
// adds its public projection routes here before the real source-A freeze.
export const METHOD_SOURCE_PATHS = Object.freeze([
  "src/lib/disaster-incidents/types.ts",
  "src/lib/disaster-incidents/limits.mjs",
  "src/lib/disaster-incidents/canonical.mjs",
  "src/lib/disaster-incidents/model.mjs",
  "src/lib/disaster-incidents/formats.mjs",
  "src/lib/disaster-incidents/projection.mjs",
  "src/lib/disaster-incidents/source-adapters.mjs",
  "src/lib/disaster-incidents/capture.mjs",
  "src/lib/disaster-incidents/capture-io.mjs",
  "src/lib/disaster-incidents/git.mjs",
  "scripts/disasters-prepare.mjs",
  "scripts/disasters-capture.mjs",
  "scripts/check-disaster-history.mjs",
  "src/lib/disaster-incidents/public.mjs",
  "src/components/DisasterDesk.astro",
  "src/scripts/disaster-desk.js",
  "src/styles/disaster-desk.css",
  "src/pages/disasters/index.astro",
  "src/pages/disasters/incidents/[id].astro",
  "src/pages/disasters/editions/[id].astro",
  "src/pages/disasters/editions/[id]/incidents/[incidentId].astro",
  "src/pages/disasters/sources/[id]/[version].astro",
  "src/pages/disasters/editions/[id]/[artifact].ts",
  "src/pages/disasters/editions/[id]/incidents/[incidentId]/[artifact].ts",
  "src/pages/disasters/history.json.ts",
  "src/components/tools/disaster-response-guide.astro",
  "src/components/tools/public-api.astro",
  "src/lib/api.ts",
  "src/pages/api/v1/[name].json.ts",
  "src/pages/api/v1/index.json.ts",
  "package.json",
  "package-lock.json",
  "src/lib/site.ts",
]);

export function methodSourcePaths() {
  const result = [...new Set([...METHOD_SOURCE_PATHS, ...interpretationFiles().map(p => p.path)])].sort();
  if (result.length > 64) fail("the closed method inventory exceeds64 files");
  return result;
}
function gitEnv() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("GIT_")) delete env[name];
  return { ...env, GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_COUNT: "0", GIT_OPTIONAL_LOCKS: "0" };
}
export function gitRead(repo, args, maximum = 32 * 1024 * 1024) {
  try { return execFileSync("git", ["-C", repo, "--no-replace-objects", ...args], { env: gitEnv(), maxBuffer: maximum, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }); }
  catch { fail("required local Git object or command is unavailable; no fetch was attempted"); }
}
const line = (repo, args) => gitRead(repo, args).toString("utf8").trim();
function commitId(value) { if (typeof value !== "string" || !COMMIT.test(value) || /^0+$/.test(value)) fail("use an exact nonzero40-hex commit"); return value; }
export function checkedRepository(repo) {
  const resolved = realpathSync(repo);
  if (realpathSync(line(resolved, ["rev-parse", "--show-toplevel"])) !== resolved) fail("use the actual repository root");
  if (line(resolved, ["rev-parse", "--is-shallow-repository"]) !== "false") fail("shallow ancestry is unavailable");
  if (line(resolved, ["for-each-ref", "--format=%(refname)", "refs/replace"])) fail("replace objects are not admitted");
  const common=realpathSync(path.resolve(resolved,line(resolved,["rev-parse","--git-common-dir"])));
  if(!lstatSync(common).isDirectory())fail("common Git directory is not ordinary");
  for(const gitDirectory of new Set([repositoryGitDirectory(resolved),common]))try { if (readBoundedWorkingFile(path.join(gitDirectory, "info/grafts"),1048576).length) fail("grafted ancestry is not admitted"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const config = line(resolved, ["config", "--includes", "--list"]);
  if (/(?:^|\n)(?:extensions\.partialclone|remote\.[^=\n]+\.promisor)=/i.test(config)) fail("promisor history is not admitted");
  return resolved;
}
export function repositoryGitDirectory(repo) {
  const result = line(repo, ["rev-parse", "--absolute-git-dir"]);
  const real = realpathSync(result);
  if (!lstatSync(real).isDirectory()) fail("Git directory is not ordinary");
  return real;
}
export function currentCommit(repo) { return commitId(line(repo, ["rev-parse", "--verify", "HEAD^{commit}"])); }
export function isAncestor(repo, before, after) {
  commitId(before); commitId(after);
  // merge-base code1 means a proved non-ancestor. All other failures refuse.
  try { execFileSync("git", ["-C", repo, "--no-replace-objects", "merge-base", "--is-ancestor", before, after], { env: gitEnv(), timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch (error) { if (error.status === 1) return false; fail("ancestry is unavailable"); }
}
export function readGitFile(repo, commit, file) {
  commitId(commit);
  if (!safeRelative(file)) fail("unsafe source path");
  const spec = `${commit}:${file}`;
  const mode = line(repo, ["ls-tree", commit, "--", file]);
  if (!mode.startsWith("100644 blob ") && !mode.startsWith("100755 blob ")) fail("source file is missing or not ordinary");
  return gitRead(repo, ["cat-file", "blob", spec], MAX_FILE + 1);
}
export function safeRelative(file) {
  return typeof file === "string" && file.length <= 240 && !file.includes("\\") && !file.includes("%") && !/[\x00-\x1f\x7f]/.test(file) && !path.posix.isAbsolute(file) && file.split("/").every(p => p && p !== "." && p !== "..");
}
function inventoryFromTree(repo, commit, blobs) {
  const result = new Map(); let total = 0;
  for (const item of gitRead(repo, ["ls-tree", "-r", "-z", "--full-tree", commit, "--", DISASTER_ROOT]).toString("utf8").split("\0").filter(Boolean)) {
    const match = /^(100644) blob ([a-f0-9]{40})\t(.+)$/.exec(item);
    if (!match || !match[3].startsWith(DISASTER_ROOT + "/")) fail("data contains a nonordinary Git entry");
    const file = match[3].slice(DISASTER_ROOT.length + 1);
    if (!safeRelative(file) || result.has(file) || result.size >= 905) fail("unsafe, duplicate or oversized data inventory");
    if (!blobs.has(match[2])) blobs.set(match[2], gitRead(repo, ["cat-file", "blob", match[2]], MAX_FILE + 1));
    const bytes = blobs.get(match[2]); total += bytes.length;
    if (bytes.length > MAX_FILE || total > MAX_PUBLIC) fail("data exceeds public byte bounds");
    result.set(file, bytes);
  }
  return result;
}
export function readCommittedDisasterInventory(repo, commit) { return inventoryFromTree(repo, commitId(commit), new Map()); }
export function readWorkingDisasterInventory(repo) {
  const root = path.join(repo, DISASTER_ROOT), files = new Map(); let total = 0;
  let info; try { info = lstatSync(root); } catch (error) { if (error.code === "ENOENT") return files; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("data root is not an ordinary directory");
  let directories=0,entries=0;
  function walk(directory, prefix = "", depth=0) {
    if(depth>8||++directories>906)fail("working directory depth or count exceeds bounds");
    if(realpathSync(directory)!==path.resolve(directory))fail("working directory traverses a symlink");
    const fd=openSync(directory,constants.O_RDONLY|(constants.O_NOFOLLOW||0)),before=fstatSync(fd,{bigint:true});
    if(!before.isDirectory()){closeSync(fd);fail("working directory is not ordinary");}
    try { const names=[],iterator=opendirSync(directory);try{let item;while((item=iterator.readSync())){if(++entries>1811)fail("working directory entry count exceeds bounds");names.push(item.name);}}finally{iterator.closeSync();}for (const name of names.sort()) {
      const relative = prefix + name, absolute = path.join(directory, name), stat = lstatSync(absolute);
      if (!safeRelative(relative)) fail("unsafe working data path");
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(absolute, relative + "/",depth+1);
      else {
        if (!ordinary(stat) || files.size >= 905 || stat.size > MAX_FILE) fail("working inventory is not bounded ordinary files");
        const bytes = readBoundedWorkingFile(absolute);
        total += bytes.length; if (total > MAX_PUBLIC) fail("working inventory exceeds80 MiB"); files.set(relative, bytes);
      }
    }
    const after=fstatSync(fd,{bigint:true}),atPath=lstatSync(directory,{bigint:true});
    if(!after.isDirectory()||!atPath.isDirectory()||atPath.isSymbolicLink()||!sameStat(before,after)||!sameStat(after,atPath)||realpathSync(directory)!==path.resolve(directory))fail("working directory changed during traversal");
    } finally {closeSync(fd);}
  }
  walk(root); return files;
}
function sameInventory(a, b) { if (a.size !== b.size) return false; for (const [file, bytes] of a) if (!b.has(file) || !equal(bytes, b.get(file))) return false; return true; }
function methodRecords(files) { return [...files].filter(([file]) => /^methods\/[^/]+\/v[1-9]\d*\.json$/.test(file)).map(([, bytes]) => JSON.parse(Buffer.from(bytes).toString("utf8"))); }
function checkMethodSource(repo, method) {
  const expected = methodSourcePaths(), actual = method.sourceFiles.map(p => p.path);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail("method does not pin the exact closed semantic file inventory");
  commitId(method.sourceCommit);
  for (const pin of method.sourceFiles) {
    const bytes = readGitFile(repo, method.sourceCommit, pin.path);
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) fail("source A bytes differ from a method file pin");
  }
  // Interpreter semantics are immutable across newer source commits.
  for (const pin of interpretationFiles()) {
    const retained = method.sourceFiles.find(p => p.path === pin.path);
    if (!retained || retained.bytes !== pin.bytes || retained.sha256 !== pin.sha256) fail("historical interpreter binding is unavailable or changed");
  }
}
export function methodSourceInventory(repo, sourceCommit) {
  return methodSourcePaths().map(file => { const bytes = readGitFile(repo, sourceCommit, file); return { path: file, bytes: bytes.length, sha256: sha(bytes) }; });
}
function immutableParent(parent, child) {
  for (const [file, bytes] of parent.files) if (file !== "registry.json" && (!child.files.has(file) || !equal(bytes, child.files.get(file)))) fail("an immutable historical file was removed or replaced");
  if (parent.registry.bootstrapSourceCommit !== child.registry.bootstrapSourceCommit) fail("bootstrap source history was replaced");
  const before = parent.registry.editions, after = child.registry.editions;
  if (before.length > after.length || before.some((v, i) => JSON.stringify(v) !== JSON.stringify(after[i]))) fail("each parent edition history must remain an exact prefix; no rewind, reordering or fork weaving");
}
export function checkDisasterHistory({ repo = process.cwd(), exactHead, working = true } = {}) {
  repo = checkedRepository(repo); const head = currentCommit(repo);
  if (exactHead !== undefined && commitId(exactHead) !== head) fail("selected head differs from checkout HEAD");
  const rows = line(repo, ["rev-list", "--reverse", "--topo-order", "--parents", head]).split("\n").filter(Boolean).map(v => v.split(" "));
  const states = new Map(), trees = new Map(), blobs = new Map(), sourceChecks = new Set(), artifactChecks = new Set(); let editions = 0, artifactCommits = 0;
  for (const [commit, ...parents] of rows) {
    const treeLine = line(repo, ["ls-tree", commit, "--", DISASTER_ROOT]);
    let state = null;
    if (treeLine) {
      if (!/^040000 tree [a-f0-9]{40}\t/.test(treeLine)) fail("data root is not a Git tree");
      const tree = treeLine.split(/[ \t]/)[2];
      if (!trees.has(tree)) {
        const files = inventoryFromTree(repo, commit, blobs), handle = admitProductionHistory(files), registry = historyRegistry(handle);
        trees.set(tree, { files: historyInventory(handle), registry, methods: methodRecords(files) });
      }
      state = trees.get(tree); editions = state.registry.editions.length;
      for (const parent of parents.map(p => states.get(p)).filter(Boolean)) immutableParent(parent, state);
      const bootstrap = commitId(state.registry.bootstrapSourceCommit);
      if (!isAncestor(repo, bootstrap, commit) || line(repo,["ls-tree",bootstrap,"--",DISASTER_ROOT])) fail("bootstrap A must be an available ancestor without any data root");
      for (const method of state.methods) {
        const recordFile = `methods/${method.id}/v${method.version}.json`;
        if (!sourceChecks.has(method.hash)) { checkMethodSource(repo, method); sourceChecks.add(method.hash); }
        if (!parents.some(p => states.get(p)?.files.has(recordFile))) {
          artifactCommits++;
        }
      }
      for(const [file,raw] of state.files){
        if(!file.startsWith("methods/")&&!file.startsWith("editions/"))continue;
        if(parents.some(p=>states.get(p)?.files.has(file)))continue;
        const record=JSON.parse(Buffer.from(raw).toString("utf8")),method=record.kind==="method"?record:state.methods.find(m=>m.hash===record.interpretation.hash);
        if(!method)fail("introduced edition method is unavailable");
        const key=commit+":"+method.hash;if(artifactChecks.has(key))continue;artifactChecks.add(key);
        if(!parents.some(p=>isAncestor(repo,method.sourceCommit,p)))fail("actual source A must precede introducing artifact B");
        for(const pin of method.sourceFiles){const bytes=readGitFile(repo,commit,pin.path);if(bytes.length!==pin.bytes||sha(bytes)!==pin.sha256)fail("artifact-introducing B changed semantic source A bytes");}
      }
    } else if (parents.some(p => states.get(p))) fail("a descendant removed its historical data root");
    states.set(commit, state);
  }
  const state = states.get(head);
  if (working) {
    if (!sameInventory(state?.files ?? new Map(), readWorkingDisasterInventory(repo))) fail("direct working bytes differ from exact committed inventory");
    // Check every owned semantic path against HEAD directly; assume-unchanged,
    // sparse-index and skip-worktree flags never supply source authority.
    for (const file of methodSourcePaths()) {
      let tracked; try { tracked = readGitFile(repo, head, file); } catch (error) { if (!state) continue; throw error; }
      const absolute = path.join(repo, file);
      if (!equal(tracked, readBoundedWorkingFile(absolute))) fail("direct working semantic bytes differ from HEAD");
    }
  }
  return { mode: state ? "committed-verified" : "no-artifacts", head, commitsExamined: rows.length, retainedEditions: state?.registry.editions.length ?? 0, artifactCommits, immutableFiles: state ? state.files.size - 1 : 0 };
}

export function verifyCaptureAuthority(repo, sourceCommit, method, { uncommittedData = false } = {}) {
  repo = checkedRepository(repo); commitId(sourceCommit);
  if (currentCommit(repo) !== sourceCommit || method.sourceCommit !== sourceCommit) fail("capture requires the actual current committed source A");
  checkDisasterHistory({ repo, exactHead: sourceCommit, working: !uncommittedData }); checkMethodSource(repo, method);
  if (uncommittedData) for (const file of methodSourcePaths()) { const expected=readGitFile(repo,sourceCommit,file),absolute=path.join(repo,file);if(!equal(expected,readBoundedWorkingFile(absolute)))fail("direct working semantic bytes differ from source A"); }
  return { repo, sourceCommit, inventory: methodSourceInventory(repo, sourceCommit) };
}
