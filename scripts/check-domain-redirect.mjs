import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directory = fileURLToPath(
  new URL("../services/domain-redirect/", import.meta.url),
);
const config = JSON.parse(await readFile(`${directory}/vercel.json`, "utf8"));
assert.deepEqual(config, {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null,
  installCommand: "",
  buildCommand: "",
  outputDirectory: "public",
  redirects: [
    {
      source: "/:path(.*)",
      destination: "https://charitology.org/:path",
      permanent: true,
    },
  ],
});
const html = await readFile(`${directory}/public/index.html`, "utf8");
assert.match(html, /href="https:\/\/charitology\.org\/"/);
assert.doesNotMatch(html, /<script|http-equiv|<iframe/i);
console.log(
  "Domain redirect: fixed origin, static-only configuration and inert fallback passed.",
);

const args = process.argv.slice(2);
if (args.length === 0) process.exit(0);
assert.equal(args.length, 4, "Use --deployment <url> --cli <vc.js path>.");
assert.equal(args[0], "--deployment");
assert.equal(args[2], "--cli");
const deployment = new URL(args[1]);
assert.equal(deployment.protocol, "https:");
assert.match(deployment.hostname, /^[a-z0-9-]+\.vercel\.app$/);
assert.equal(
  deployment.href,
  `${deployment.origin}/`,
  "Use an exact deployment origin.",
);
assert.ok(args[3].startsWith("/"), "CLI path must be absolute.");

const cases = [
  ["/", "https://charitology.org/"],
  ["/tools/values-compass/", "https://charitology.org/tools/values-compass/"],
  [
    "/record/principles/?charitology_audit=synthetic",
    "https://charitology.org/record/principles/?charitology_audit=synthetic",
  ],
  [
    "/tools/values-compass/?a=1&a=2&empty=",
    "https://charitology.org/tools/values-compass/?a=1&a=2&empty=",
  ],
  [
    "/synthetic%20path/?q=a%2Bb&percent=%25",
    "https://charitology.org/synthetic%20path/?q=a%2Bb&percent=%25",
  ],
  [
    "/synthetic-missing?next=https%3A%2F%2Fexample.invalid",
    "https://charitology.org/synthetic-missing?next=https%3A%2F%2Fexample.invalid",
  ],
];
for (const [path, expected] of cases) {
  for (const method of ["HEAD", "GET"]) {
    const r = spawnSync(
      process.execPath,
      [
        args[3],
        "curl",
        path,
        "--deployment",
        deployment.origin,
        "--",
        ...(method === "HEAD" ? ["--head"] : []),
        "--dump-header",
        "-",
        "--output",
        "/dev/null",
        "--silent",
        "--show-error",
        "--max-time",
        "20",
        "--max-redirs",
        "0",
        "--path-as-is",
      ],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 128 * 1024,
      },
    );
    assert.equal(
      r.status,
      0,
      `Authenticated request failed for ${path}; no response or credentials printed.`,
    );
    const statuses = [...r.stdout.matchAll(/^HTTP\/[^\s]+\s+(\d{3})/gim)];
    assert.equal(
      statuses.at(-1)?.[1],
      "308",
      `Expected permanent redirect for ${path}.`,
    );
    const locations = [...r.stdout.matchAll(/^location:\s*(.*?)\r?$/gim)];
    assert.equal(
      locations.at(-1)?.[1],
      expected,
      `Location differs for ${path}.`,
    );
    console.log(`Hosted redirect passed: ${method} ${path}`);
  }
}
console.log(
  `Domain redirect: ${cases.length * 2} exact protected-deployment requests passed.`,
);
