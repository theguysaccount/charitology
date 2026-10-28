import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  LEARNING_NATIVE_REGISTRY,
  LEARNING_NATIVE_REGISTRY_SHA256,
} from "../lib/learning-native.mjs";
import { learningHash } from "../lib/learning-json.mjs";
test("literal v1 registry pin admits exact checked native interpretation", () => {
  assert.equal(
    LEARNING_NATIVE_REGISTRY_SHA256,
    "9e12453e6178202ea7e47ce7610311c7a5a7d3be09456544902ac524ef88f906",
  );
  assert.equal(
    learningHash("registry", LEARNING_NATIVE_REGISTRY),
    LEARNING_NATIVE_REGISTRY_SHA256,
  );
});
test("a changed generated-manifest fingerprint refuses module load instead of redefining retained v1", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "charitology-learning-v1-pin-"),
  );
  try {
    const native = new URL("../lib/learning-native.mjs", import.meta.url),
      raw = await fs.readFile(native, "utf8"),
      source = raw
        .replace(
          'from "./learning-native-admission.mjs"',
          "from " +
            JSON.stringify(
              new URL("../lib/learning-native-admission.mjs", import.meta.url)
                .href,
            ),
        )
        .replace(
          'from "./learning-json.mjs"',
          "from " +
            JSON.stringify(
              new URL("../lib/learning-json.mjs", import.meta.url).href,
            ),
        ),
      entry = path.join(directory, "learning-native.mjs"),
      manifestPath = path.join(directory, "learning-native-manifest.json"),
      original = JSON.parse(
        await fs.readFile(
          new URL("../lib/learning-native-manifest.json", import.meta.url),
          "utf8",
        ),
      );
    await fs.writeFile(entry, source);
    const load = () =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "const m=await import(" +
            JSON.stringify(pathToFileURL(entry).href) +
            ");process.stdout.write(m.LEARNING_NATIVE_REGISTRY_SHA256)",
        ],
        { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
      );
    await fs.writeFile(manifestPath, JSON.stringify(original));
    assert.equal(load(), LEARNING_NATIVE_REGISTRY_SHA256);
    for (const mutate of [
      (m) => (m.sourceFiles[0].sha256 = "0".repeat(64)),
      (m) => (m.bundle.sha256 = "1".repeat(64)),
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      await fs.writeFile(manifestPath, JSON.stringify(changed));
      assert.throws(
        load,
        (error) =>
          error.status !== 0 &&
          String(error.stderr).includes(
            "Learning v1 native interpretation changed. Add an explicit new adapter version and historical admission",
          ),
      );
    }
    assert.equal(await fs.readFile(native, "utf8"), raw);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
