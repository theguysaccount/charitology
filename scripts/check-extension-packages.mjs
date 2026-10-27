// Independent package acceptance: Python's standard ZIP/CRC reader plus actual
// exported validators and isolated CLI runs. This never regenerates repo files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import {
  EXTENSION_FILES,
  PACKAGE_NAMES,
  crc32,
  packageEntries,
  releaseSite,
  storedZip,
  validateReleaseBaseline,
  validateStoredZip,
} from "./lib/extension-package.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const allowed = [
  "checklist.json",
  "content.js",
  "icons/icon-128.png",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js",
];
const packageNames = [
  "charitology-extension.zip",
  "charitology-firefox.zip",
  "charitology-chrome.zip",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let groups = 0;
function check(name, run) {
  run();
  groups++;
  console.log(`✓ ${name}`);
}

// Python zipfile independently decompresses/reads every entry and verifies its
// CRC. Explicit format checks supplement what zipfile permissively accepts.
const pythonOracle = String.raw`
import binascii, hashlib, io, json, struct, sys, zipfile
raw=sys.stdin.buffer.read()
expected=json.loads(sys.argv[1])
assert 22 <= len(raw) <= 2*1024*1024
end=len(raw)-22
sig,disk,start_disk,n_disk,n,size,central,comment=struct.unpack_from('<4s4H2IH',raw,end)
assert sig==b'PK\x05\x06' and disk==start_disk==comment==0
assert n==n_disk==len(expected) and central+size==end
cursor=0; c=central; result=[]
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 assert z.testzip() is None
 assert z.namelist()==expected and not z.comment
 for info in z.infolist():
  assert info.filename in expected and not info.is_dir()
  assert info.flag_bits==0x800 and info.compress_type==zipfile.ZIP_STORED
  assert info.date_time==(2026,1,1,0,0,0)
  assert info.file_size==info.compress_size <= 1024*1024
  assert info.header_offset==cursor
  h=struct.unpack_from('<4s5H3I2H',raw,cursor)
  assert h[0]==b'PK\x03\x04' and h[1:6]==(20,2048,0,0,23585)
  assert h[6:9]==(info.CRC,info.file_size,info.file_size) and h[10]==0
  name=info.filename.encode('utf8')
  assert h[9]==len(name) and raw[cursor+30:cursor+30+len(name)]==name
  start=cursor+30+len(name); data=z.read(info)
  assert data==raw[start:start+len(data)]
  assert (binascii.crc32(data)&0xffffffff)==info.CRC
  ch=struct.unpack_from('<4s6H3I5H2I',raw,c)
  assert ch[0]==b'PK\x01\x02' and ch[1:7]==(20,20,2048,0,0,23585)
  assert ch[7:10]==(info.CRC,info.file_size,info.file_size)
  assert ch[10:15]==(len(name),0,0,0,0) and ch[15:]==(0,cursor)
  assert raw[c+46:c+46+len(name)]==name
  result.append(dict(name=info.filename,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),local=cursor,central=c,data=start,crc=info.CRC))
  cursor=start+len(data);c+=46+len(name)
assert cursor==central and c==end
print(json.dumps(dict(entries=result,central=central,end=end,sha256=hashlib.sha256(raw).hexdigest())))
`;
const pythonBuild = String.raw`
import io, struct, sys, zipfile
raw=sys.stdin.buffer.read();mode=sys.argv[1];src=zipfile.ZipFile(io.BytesIO(raw));out=io.BytesIO()
entries=[(i.filename,src.read(i)) for i in src.infolist()]
if mode=='duplicate':entries[-1]=(entries[0][0],entries[-1][1])
if mode in ('traversal','absolute','windows','hidden','unexpected'):
 names={'traversal':'../checklist.json','absolute':'/checklist.json','windows':'icons\\icon-16.png','hidden':'.checklist.json','unexpected':'background.js'}
 entries[0]=(names[mode],entries[0][1])
if mode=='reverse':entries.reverse()
if mode=='oversized':entries=[(n,b'x'*(1024*1024+1) if n=='popup.css' else d) for n,d in entries]
if mode=='entry-limit':entries=[(n,b'x'*(1024*1024) if n=='popup.css' else d) for n,d in entries]
if mode in ('archive-limit','archive-too-large'):
 entries=[(n,b'' if n in ('popup.css','content.js') else d) for n,d in entries]
 base=22+sum(76+2*len(n.encode('utf8'))+len(d) for n,d in entries)
 remaining=2*1024*1024+(1 if mode=='archive-too-large' else 0)-base
 entries=[(n,b'x'*(1024*1024) if n=='popup.css' else b'y'*(remaining-1024*1024) if n=='content.js' else d) for n,d in entries]
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_STORED) as z:
 for name,data in entries:
  i=zipfile.ZipInfo(name,(2026,1,1,0,0,0));i.create_system=0;i.create_version=i.extract_version=20
  i.compress_type=zipfile.ZIP_DEFLATED if mode=='compressed' else zipfile.ZIP_STORED
  z.writestr(i,data)
 if mode=='comment':z.comment=b'not part of this release format'
b=bytearray(out.getvalue());end=len(b)-22
if mode=='comment':end-=len(b'not part of this release format')
p=struct.unpack_from('<I',b,end+16)[0]
while b[p:p+4]==b'PK\x01\x02':
 struct.pack_into('<H',b,p+8,2048);struct.pack_into('<I',b,p+38,0)
 local=struct.unpack_from('<I',b,p+42)[0];struct.pack_into('<H',b,local+6,2048)
 p+=46+struct.unpack_from('<H',b,p+28)[0]
sys.stdout.buffer.write(b)
`;
function python(code, args, bytes) {
  const run = spawnSync(
    process.env.PYTHON || "python3",
    ["-c", code, ...args],
    {
      input: bytes,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15_000,
    },
  );
  if (run.error) throw run.error;
  return run;
}
function oracle(zip) {
  const run = python(pythonOracle, [JSON.stringify(allowed)], zip);
  assert.equal(
    run.status,
    0,
    `Independent ZIP reader refused: ${String(run.stderr).slice(-1200)}`,
  );
  return JSON.parse(String(run.stdout));
}
function independentZip(zip, mode) {
  const run = python(pythonBuild, [mode], zip);
  assert.equal(
    run.status,
    0,
    `Independent ZIP construction failed: ${String(run.stderr).slice(-1200)}`,
  );
  return run.stdout;
}
function refused(zip, label) {
  assert.throws(
    () => validateStoredZip(zip),
    undefined,
    `${label} must be refused`,
  );
  assert.notEqual(
    python(pythonOracle, [JSON.stringify(allowed)], zip).status,
    0,
    `${label}: independent oracle must also refuse`,
  );
}

const source = new Map(
  allowed.map((name) => [name, readFileSync(join(root, "extension", name))]),
);
const checklist = JSON.parse(
  readFileSync(join(root, "src/data/checklist.json"), "utf8"),
);
const checklistBytes = Buffer.from(
  JSON.stringify(
    checklist.map(({ question, detail }) => ({ question, detail })),
    null,
    2,
  ) + "\n",
);
const sourceHashes = new Map(
  [...source].map(([name, data]) => [name, hash(data)]),
);
const current = new Map(
  packageNames.map((name) => [
    name,
    readFileSync(join(root, "public/downloads", name)),
  ]),
);
const originalMetadata = readFileSync(
  join(root, "public/downloads/extension-release.json"),
);
let alternateMetadata;
const temp = mkdtempSync(join(tmpdir(), "charitology-extension-check-"));
let fixtureCounter = 0;
function fixture() {
  const dir = join(temp, `case-${fixtureCounter++}`);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(join(root, "scripts/lib"), join(dir, "scripts/lib"), {
    recursive: true,
  });
  cpSync(
    join(root, "scripts/zip-extension.mjs"),
    join(dir, "scripts/zip-extension.mjs"),
  );
  cpSync(join(root, "extension"), join(dir, "extension"), { recursive: true });
  mkdirSync(join(dir, "src/data"), { recursive: true });
  cpSync(
    join(root, "src/data/checklist.json"),
    join(dir, "src/data/checklist.json"),
  );
  mkdirSync(join(dir, "public/downloads"), { recursive: true });
  return dir;
}
function cli(dir, env = {}) {
  return spawnSync(process.execPath, [join(dir, "scripts/zip-extension.mjs")], {
    cwd: dir,
    env: {
      ...process.env,
      SITE_URL: "https://charitology.org",
      BASE_PATH: "/",
      ...env,
    },
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 64 * 1024,
  });
}
function requireSuccess(result) {
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
}
function sentinelFailure(env, mutate = () => {}, expectedError) {
  const dir = fixture();
  const paths = [
    ...packageNames.map((name) => join(dir, "public/downloads", name)),
    join(dir, "public/downloads/extension-release.json"),
    join(dir, "extension/checklist.json"),
  ];
  for (const [i, path] of paths.entries())
    writeFileSync(path, `protected-artifact-${i}`);
  mutate(dir);
  const before = paths.map((path) => hash(readFileSync(path)));
  const result = cli(dir, env);
  if (result.error) throw result.error;
  assert.notEqual(
    result.status,
    0,
    "Invalid release input unexpectedly succeeded",
  );
  if (expectedError) assert.match(result.stderr, expectedError);
  assert.deepEqual(
    paths.map((path) => hash(readFileSync(path))),
    before,
    "A rejected build replaced an existing artifact",
  );
}

try {
  check(
    "Fixed allowlist, CRC known vector and current source checklist",
    () => {
      assert.deepEqual(EXTENSION_FILES, allowed);
      assert.deepEqual(PACKAGE_NAMES, packageNames);
      assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
      assert.equal(crc32(Buffer.alloc(0)), 0);
      assert.deepEqual(source.get("checklist.json"), checklistBytes);
      assert.equal(checklist.length, 10);
      for (const row of checklist)
        for (const field of ["question", "detail"])
          assert.equal(typeof row[field], "string");
    },
  );
  check(
    "All three actual ZIPs independently validate every CRC, header, directory and offset",
    () => {
      for (const [name, zip] of current) {
        const observed = oracle(zip),
          parsed = validateStoredZip(zip);
        assert.equal(observed.sha256, hash(zip), name);
        for (const entry of observed.entries)
          assert.equal(
            hash(parsed.get(entry.name)),
            entry.sha256,
            `${name}: ${entry.name}`,
          );
      }
    },
  );
  check(
    "Exact source correspondence, baked settings and Chrome/Firefox manifest differences",
    () => {
      const original = JSON.parse(source.get("manifest.json"));
      assert.match(original.version, /^\d+\.\d+\.\d+$/);
      assert.deepEqual(original.permissions, ["activeTab", "storage"]);
      for (const [name, zip] of current) {
        const parsed = validateStoredZip(zip),
          expectedManifest = structuredClone(original);
        if (name === "charitology-chrome.zip")
          delete expectedManifest.browser_specific_settings;
        else assert.ok(expectedManifest.browser_specific_settings?.gecko);
        assert.deepEqual(
          JSON.parse(parsed.get("manifest.json")),
          expectedManifest,
        );
        assert.equal(
          parsed.get("manifest.json").toString(),
          JSON.stringify(expectedManifest, null, 2) + "\n",
        );
        for (const [file, bytes] of source) {
          if (file === "manifest.json") continue;
          if (!["content.js", "popup.js"].includes(file))
            assert.deepEqual(parsed.get(file), bytes, `${name}: ${file}`);
          else {
            const raw = bytes.toString();
            const settings = [
              ...raw.matchAll(
                /\bconst\s+SITE_SETTING\s*=\s*(?:"__CHARITOLOGY_SITE__"|'__CHARITOLOGY_SITE__')\s*;/g,
              ),
            ];
            assert.equal(settings.length, 1, `${file}: one literal setting`);
            assert.equal(raw.split("__CHARITOLOGY_SITE__").length, 2);
            const setting = settings[0];
            const expected =
              raw.slice(0, setting.index) +
              'const SITE_SETTING = "https://charitology.org";' +
              raw.slice(setting.index + setting[0].length);
            assert.equal(parsed.get(file).toString(), expected);
            assert.ok(!expected.includes("__CHARITOLOGY_SITE__"));
            new vm.Script(expected, { filename: file });
          }
        }
      }
      assert.deepEqual(
        current.get("charitology-extension.zip"),
        current.get("charitology-firefox.zip"),
      );
      assert.notDeepEqual(
        current.get("charitology-chrome.zip"),
        current.get("charitology-firefox.zip"),
      );
    },
  );
  check(
    "Actual exported writer is deterministic and does not mutate its source map",
    () => {
      for (const target of ["chrome", "firefox"]) {
        const first = storedZip(
          packageEntries(source, target, releaseSite().site),
        );
        const second = storedZip(
          packageEntries(source, target, releaseSite().site),
        );
        assert.deepEqual(first, second);
        assert.deepEqual(
          first,
          current.get(
            target === "chrome"
              ? "charitology-chrome.zip"
              : "charitology-firefox.zip",
          ),
        );
        oracle(first);
      }
      assert.deepEqual(
        new Map([...source].map(([name, data]) => [name, hash(data)])),
        sourceHashes,
      );
    },
  );
  check(
    "Independent ZIP writer interoperability and strict path/format refusal",
    () => {
      const valid = current.get("charitology-chrome.zip");
      const rebuilt = independentZip(valid, "valid");
      oracle(rebuilt);
      assert.deepEqual(
        [...validateStoredZip(rebuilt)],
        [...validateStoredZip(valid)],
      );
      for (const mode of [
        "duplicate",
        "traversal",
        "absolute",
        "windows",
        "hidden",
        "unexpected",
        "reverse",
        "compressed",
        "comment",
        "oversized",
      ])
        refused(independentZip(valid, mode), mode);
    },
  );
  check(
    "Exact entry and archive size boundaries use independent valid ZIPs",
    () => {
      const valid = current.get("charitology-chrome.zip");
      const entryLimit = independentZip(valid, "entry-limit");
      assert.equal(
        validateStoredZip(entryLimit).get("popup.css").length,
        1024 * 1024,
      );
      oracle(entryLimit);
      const archiveLimit = independentZip(valid, "archive-limit");
      assert.equal(archiveLimit.length, 2 * 1024 * 1024);
      validateStoredZip(archiveLimit);
      oracle(archiveLimit);
      const archiveTooLarge = independentZip(valid, "archive-too-large");
      assert.equal(archiveTooLarge.length, 2 * 1024 * 1024 + 1);
      refused(archiveTooLarge, "one byte beyond complete archive bound");
    },
  );
  check(
    "Every entry CRC is checked and malformed UTF-8 names are refused",
    () => {
      const valid = current.get("charitology-chrome.zip"),
        info = oracle(valid);
      for (const entry of info.entries) {
        assert.ok(entry.bytes > 0);
        const bad = Buffer.from(valid);
        bad[entry.data + entry.bytes - 1] ^= 1;
        refused(bad, `${entry.name} payload corruption`);
      }
      const badName = Buffer.from(valid),
        first = info.entries[0];
      badName[first.local + 30] = 0xff;
      badName[first.central + 46] = 0xff;
      refused(badName, "invalid UTF-8 local and central name");
    },
  );
  check(
    "Corrupt local header, filename, payload and declared lengths are refused",
    () => {
      const valid = current.get("charitology-chrome.zip"),
        info = oracle(valid).entries[0];
      for (const offset of [
        0,
        4,
        6,
        8,
        10,
        12,
        14,
        18,
        22,
        26,
        28,
        30,
        info.data,
      ]) {
        const bad = Buffer.from(valid);
        bad[info.local + offset] ^= 1;
        refused(bad, `local offset ${offset}`);
      }
    },
  );
  check(
    "Corrupt central directory metadata, names and offsets are refused",
    () => {
      const valid = current.get("charitology-chrome.zip"),
        info = oracle(valid).entries[0];
      for (const offset of [
        0, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 30, 32, 34, 36, 38, 42, 46,
      ]) {
        const bad = Buffer.from(valid);
        bad[info.central + offset] ^= 1;
        refused(bad, `central offset ${offset}`);
      }
    },
  );
  check(
    "EOCD counts/disks/sizes, truncation, prefix/suffix and size bounds are refused",
    () => {
      const valid = current.get("charitology-chrome.zip"),
        end = valid.length - 22;
      for (const offset of [0, 4, 6, 8, 10, 12, 16, 20]) {
        const bad = Buffer.from(valid);
        bad[end + offset] ^= 1;
        refused(bad, `EOCD offset ${offset}`);
      }
      for (const length of [
        0,
        21,
        29,
        100,
        Math.floor(valid.length / 2),
        valid.length - 1,
      ])
        refused(valid.subarray(0, length), `truncated ${length}`);
      refused(Buffer.concat([Buffer.from([0]), valid]), "prepended byte");
      refused(Buffer.concat([valid, Buffer.from([0])]), "trailing byte");
      assert.throws(() => validateStoredZip(Buffer.alloc(2 * 1024 * 1024 + 1)));
      assert.throws(() => validateStoredZip(new Uint8Array(valid)));
    },
  );
  check(
    "Approved release origin/base normalization and invalid destination rejection",
    () => {
      assert.deepEqual(releaseSite(), {
        origin: "https://charitology.org",
        basePath: "",
        site: "https://charitology.org",
      });
      assert.equal(
        releaseSite("https://theguysaccount.github.io", "/charitology/").site,
        "https://theguysaccount.github.io/charitology",
      );
      for (const site of [
        "http://charitology.org",
        "https://charitology.org.evil.invalid",
        "https://evil.invalid",
        "https://user:pass@charitology.org",
        "https://charitology.org/a",
        "https://charitology.org?x=1",
        "https://charitology.org/#x",
        "https://charitology.org\n",
        "https://charitology.org/';globalThis.code=1;//",
        "x".repeat(201),
      ])
        assert.throws(() => releaseSite(site));
      for (const base of [
        "",
        "relative",
        "//evil.invalid",
        "/a//b",
        "/../a",
        "/a/./b",
        "/%2e%2e/",
        "/a?x=1",
        "/#x",
        "/a\\b",
        "/';globalThis.code=1;//",
        "/a\n",
        "/" + "a".repeat(201),
      ])
        assert.throws(() => releaseSite("https://charitology.org", base));
      for (const value of [null, 42, {}, []]) {
        assert.throws(() => releaseSite(value));
        assert.throws(() => releaseSite("https://charitology.org", value));
      }
    },
  );
  check(
    "Exported entry/writer APIs reject missing, extra, oversized and capability-bearing source",
    () => {
      const missing = new Map(source);
      missing.delete("popup.js");
      const extra = new Map(source);
      extra.set("../background.js", Buffer.from("unexpected"));
      for (const map of [missing, extra]) {
        assert.throws(() => packageEntries(map, "chrome", releaseSite().site));
        assert.throws(() => storedZip(map));
      }
      const oversized = new Map(source);
      oversized.set("popup.css", Buffer.alloc(1024 * 1024 + 1));
      assert.throws(() =>
        packageEntries(oversized, "chrome", releaseSite().site),
      );
      assert.throws(() => storedZip(oversized));
      assert.throws(() =>
        packageEntries(source, "unsupported-browser", releaseSite().site),
      );
      for (const key of [
        "background",
        "host_permissions",
        "optional_permissions",
        "optional_host_permissions",
        "web_accessible_resources",
        "externally_connectable",
      ]) {
        const map = new Map(source),
          manifest = JSON.parse(map.get("manifest.json"));
        manifest[key] = [];
        map.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
        assert.throws(
          () => packageEntries(map, "chrome", releaseSite().site),
          undefined,
          key,
        );
      }
      for (const text of [
        "no-setting",
        source.get("popup.js").toString().repeat(2),
      ]) {
        const map = new Map(source);
        map.set("popup.js", Buffer.from(text));
        assert.throws(() => packageEntries(map, "chrome", releaseSite().site));
      }
    },
  );
  check(
    "Rejected actual CLI destinations preserve every existing release/checklist artifact",
    () => {
      for (const SITE_URL of [
        "http://127.0.0.1:4333",
        "https://evil.invalid",
        "https://user:pass@charitology.org",
        "https://charitology.org?private=1",
        "https://charitology.org/#fragment",
        "https://charitology.org/';globalThis.code=1;//",
        "https://charitology.org\n",
      ])
        sentinelFailure({ SITE_URL });
      for (const BASE_PATH of [
        "//evil.invalid",
        "/../a",
        "/%2e%2e/",
        "/bad?query=1",
        "/';globalThis.code=1;//",
        "/a\\b",
      ])
        sentinelFailure({ BASE_PATH });
    },
  );
  check(
    "Unexpected files, symlinks and malformed source settings fail before artifact replacement",
    () => {
      sentinelFailure({}, (dir) =>
        writeFileSync(join(dir, "extension/.hidden"), "unexpected"),
      );
      sentinelFailure({}, (dir) =>
        writeFileSync(join(dir, "extension/background.js"), "unexpected"),
      );
      sentinelFailure({}, (dir) =>
        symlinkSync("popup.js", join(dir, "extension/linked.js")),
      );
      sentinelFailure({}, (dir) =>
        writeFileSync(
          join(dir, "extension/content.js"),
          "const SITE_SETTING = 'missing-placeholder';",
        ),
      );
      sentinelFailure({}, (dir) => {
        const path = join(dir, "extension/popup.js");
        const raw = readFileSync(path);
        writeFileSync(path, Buffer.concat([raw, raw]));
      });
    },
  );
  check(
    "Two independent actual CLI builds have identical source-corresponding package bytes",
    () => {
      const first = fixture(),
        second = fixture();
      requireSuccess(cli(first));
      requireSuccess(cli(second));
      for (const name of [...packageNames, "extension-release.json"]) {
        const a = readFileSync(join(first, "public/downloads", name)),
          b = readFileSync(join(second, "public/downloads", name));
        assert.deepEqual(a, b, name);
        assert.deepEqual(
          a,
          readFileSync(join(root, "public/downloads", name)),
          `${name} is stale`,
        );
        if (name.endsWith(".zip")) oracle(a);
      }
      const subpath = fixture();
      requireSuccess(
        cli(subpath, {
          SITE_URL: "https://theguysaccount.github.io",
          BASE_PATH: "/charitology/",
        }),
      );
      alternateMetadata = JSON.parse(
        readFileSync(
          join(subpath, "public/downloads/extension-release.json"),
          "utf8",
        ),
      );
      for (const name of packageNames) {
        const zip = readFileSync(join(subpath, "public/downloads", name));
        oracle(zip);
        const entries = validateStoredZip(zip);
        for (const file of ["popup.js", "content.js"]) {
          assert.ok(
            entries
              .get(file)
              .toString()
              .includes(
                'const SITE_SETTING = "https://theguysaccount.github.io/charitology";',
              ),
          );
          assert.ok(
            !entries.get(file).toString().includes("__CHARITOLOGY_SITE__"),
          );
          new vm.Script(entries.get(file).toString());
        }
      }
    },
  );
  check(
    "Actual release baseline binds source order, version and production package bytes",
    () => {
      const metadata = JSON.parse(
        readFileSync(
          join(root, "public/downloads/extension-release.json"),
          "utf8",
        ),
      );
      const registry = JSON.parse(
        readFileSync(
          join(root, "scripts/lib/extension-release-baselines.json"),
          "utf8",
        ),
      );
      const files = allowed.map((path) => ({
        path,
        bytes: source.get(path).length,
        sha256: hash(source.get(path)),
      }));
      assert.deepEqual(metadata.sourceFiles, files);
      assert.equal(metadata.sourceSha256, hash(JSON.stringify(files)));
      const originalManifest = JSON.parse(source.get("manifest.json"));
      assert.deepEqual(
        metadata.supportedPatterns,
        originalManifest.content_scripts.flatMap((entry) => entry.matches),
      );
      assert.deepEqual(
        metadata.declaredEngines,
        originalManifest.browser_specific_settings,
      );
      assert.equal(metadata.checklistSha256, hash(checklistBytes));
      assert.deepEqual(
        metadata.packages,
        packageNames.map((path) => ({
          path,
          bytes: current.get(path).length,
          sha256: hash(current.get(path)),
        })),
      );
      assert.equal(validateReleaseBaseline(metadata, registry), true);
      for (const mutate of [
        (m) => {
          m.extensionVersion = "99.99.99";
        },
        (m) => {
          m.sourceSha256 = "0".repeat(64);
        },
        (m) => {
          m.packages[0].bytes++;
        },
        (m) => {
          m.packages[0].sha256 = "0".repeat(64);
        },
        (m) => {
          m.packages.reverse();
        },
        (m) => {
          m.packages[0].path = "../untrusted.zip";
        },
      ]) {
        const candidate = structuredClone(metadata);
        mutate(candidate);
        assert.throws(() => validateReleaseBaseline(candidate, registry));
      }
    },
  );
  check(
    "Approved alternate metadata still rejects unapproved sites and malformed package/source rows",
    () => {
      const registry = JSON.parse(
        readFileSync(
          join(root, "scripts/lib/extension-release-baselines.json"),
          "utf8",
        ),
      );
      assert.ok(
        alternateMetadata,
        "An actual alternate-path CLI build must precede this check",
      );
      assert.equal(validateReleaseBaseline(alternateMetadata, registry), true);
      const adverse = [
        (m) => {
          m.unknown = true;
        },
        (m) => {
          m.format = "other";
        },
        (m) => {
          m.version = 2;
        },
        (m) => {
          delete m.checklistSha256;
        },
        (m) => {
          m.checklistSha256 = "bad";
        },
        (m) => {
          m.storeListings = ["https://example.invalid/not-a-store-approval"];
        },
        (m) => {
          m.installedBrowserAcceptance = "approved";
        },
        (m) => {
          m.packages = [];
        },
        (m) => {
          m.packages = null;
        },
        (m) => {
          m.packages.reverse();
        },
        (m) => {
          m.packages[1].path = m.packages[0].path;
        },
        (m) => {
          m.packages[0].path = "../untrusted.zip";
        },
        (m) => {
          m.packages[0].unknown = true;
        },
        (m) => {
          m.packages[0].sha256 = "A".repeat(64);
        },
        (m) => {
          m.sourceFiles = [];
        },
        (m) => {
          m.sourceFiles.reverse();
        },
        (m) => {
          m.sourceFiles[0].sha256 = "0".repeat(64);
        },
        (m) => {
          m.sourceFiles[0].unknown = true;
        },
        ...[0, -1, 0.5, 2 * 1024 * 1024 + 1, Number.MAX_SAFE_INTEGER + 1].map(
          (bytes) => (m) => {
            m.packages[0].bytes = bytes;
          },
        ),
        ...[0, -1, 0.5, 1024 * 1024 + 1].map((bytes) => (m) => {
          m.sourceFiles[0].bytes = bytes;
        }),
        ...[
          "https://evil.invalid",
          "http://charitology.org",
          "https://charitology.org.evil.invalid",
          "https://user:pass@charitology.org",
          "https://charitology.org?private=1",
          "https://charitology.org/#fragment",
          "https://theguysaccount.github.io/charitology/",
          "https://theguysaccount.github.io/a/../charitology",
        ].map((site) => (m) => {
          m.site = site;
        }),
      ];
      for (const mutate of adverse) {
        const candidate = structuredClone(alternateMetadata);
        mutate(candidate);
        assert.throws(() => validateReleaseBaseline(candidate, registry));
      }
    },
  );
  check(
    "Baseline registry rejects unknown fields, duplicate versions and malformed package pins",
    () => {
      const metadata = JSON.parse(
        readFileSync(
          join(root, "public/downloads/extension-release.json"),
          "utf8",
        ),
      );
      const registry = JSON.parse(
        readFileSync(
          join(root, "scripts/lib/extension-release-baselines.json"),
          "utf8",
        ),
      );
      for (const mutate of [
        (r) => {
          r.unknown = true;
        },
        (r) => {
          r.format = "other";
        },
        (r) => {
          r.version = 2;
        },
        (r) => {
          r.releases = [];
        },
        (r) => {
          r.releases = Array.from({ length: 101 }, () =>
            structuredClone(r.releases[0]),
          );
        },
        (r) => {
          r.releases.push(structuredClone(r.releases[0]));
        },
        (r) => {
          delete r.releases[0].sourceSha256;
        },
        (r) => {
          r.releases[0].unknown = true;
        },
        (r) => {
          r.releases[0].extensionVersion = "not-a-version";
        },
        (r) => {
          r.releases[0].sourceSha256 = "A".repeat(64);
        },
        (r) => {
          r.releases[0].productionSite = "https://evil.invalid";
        },
        (r) => {
          r.releases[0].productionPackages.reverse();
        },
        (r) => {
          r.releases[0].productionPackages[1].path =
            r.releases[0].productionPackages[0].path;
        },
        (r) => {
          r.releases[0].productionPackages.pop();
        },
        (r) => {
          r.releases[0].productionPackages[0].unknown = true;
        },
        (r) => {
          r.releases[0].productionPackages[0].sha256 = "bad-hash";
        },
        ...[0, -1, 0.5, 2 * 1024 * 1024 + 1, Number.MAX_SAFE_INTEGER + 1].map(
          (bytes) => (r) => {
            r.releases[0].productionPackages[0].bytes = bytes;
          },
        ),
      ]) {
        const candidate = structuredClone(registry);
        mutate(candidate);
        assert.throws(() => validateReleaseBaseline(metadata, candidate));
      }
    },
  );
  check(
    "Actual same-version drift and unregistered-version CLI runs preserve sentinel artifacts",
    () => {
      sentinelFailure(
        {},
        (dir) => {
          const path = join(dir, "extension/popup.css");
          writeFileSync(
            path,
            readFileSync(path, "utf8") +
              "\n/* synthetic same-version source drift */\n",
          );
        },
        /Source drift under the same extension version/,
      );
      sentinelFailure(
        {},
        (dir) => {
          const path = join(dir, "extension/manifest.json"),
            manifest = JSON.parse(readFileSync(path, "utf8"));
          manifest.version = "99.99.99";
          writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
        },
        /Register a new extension version before packaging/,
      );
    },
  );
  check("Checks leave actual source and release artifacts untouched", () => {
    for (const [name, before] of sourceHashes)
      assert.equal(hash(readFileSync(join(root, "extension", name))), before);
    for (const [name, before] of current)
      assert.deepEqual(
        readFileSync(join(root, "public/downloads", name)),
        before,
      );
    assert.ok(
      existsSync(join(root, "public/downloads/extension-release.json")),
    );
    assert.deepEqual(
      readFileSync(join(root, "public/downloads/extension-release.json")),
      originalMetadata,
    );
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(
  `Extension packages: ${groups} independent groups passed for three actual ZIPs; no installed-browser or store acceptance is claimed.`,
);
