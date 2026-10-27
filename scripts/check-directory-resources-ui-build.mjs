import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {directoryCatalog,headDirectoryEntries,directoryEntrySha256,getDirectorySelection} from "../services/charity-os/lib/directory-catalog.mjs";
import {directoryFragment,directorySelectionFromFragment} from "../services/charity-os/public/directory-resources.js";
const capture=directoryCatalog.captures.at(-1);
let count=0;
for(const kind of ["tools","benefits"]){
  const html=await readFile(new URL(`../dist/for-charities/${kind}/index.html`,import.meta.url),"utf8");
  const entries=headDirectoryEntries(kind);
  const cards=[...html.matchAll(/<article id="([^"]+)"[^>]*data-listing[\s>]/g)];
  assert.equal(cards.length,entries.length);
  const fragments=[...html.matchAll(/href="https:\/\/os\.charitology\.org\/(#directory\/[^" ]+)"/g)].map(m=>m[1]);
  assert.equal(fragments.length,entries.length);
  assert.doesNotMatch(html,/90.day|90 days|copy automatically/i);
  assert.ok(html.includes('data-directory'));
  for(const e of entries){
    const selection={captureId:capture.captureId,catalogKind:kind,listingId:e.listing.id,entrySha256:directoryEntrySha256(e)};
    const fragment=directoryFragment(selection);
    assert.ok(fragments.includes(fragment),`missing exact fragment ${kind}/${e.listing.id}`);
    assert.deepEqual(directorySelectionFromFragment(fragment),selection);
    const sourcePath=`/data/directory-resources/captures/${capture.captureId}/entries/${kind}/${e.listing.id}.json`;
    assert.ok(html.includes(`href="${sourcePath}"`),`missing frozen source ${e.listing.id}`);
    const served=JSON.parse(await readFile(new URL(`../dist${sourcePath}`,import.meta.url),"utf8"));
    assert.deepEqual(served,e);
    assert.deepEqual(getDirectorySelection(selection).entry,served);
    assert.ok(html.includes(selection.entrySha256));
    count++;
  }
}
assert.equal(count,31);
console.log(`Directory public build: ${count} exact card → fragment → retained entry checks passed across both generated pages.`);
