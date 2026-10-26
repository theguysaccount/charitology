// Keep the owner's original brief intact and validate public directory records.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(root,path),'utf8'));
const roadmap = read('src/data/roadmap.json');
assert.equal(roadmap.entries.length,66,'Preserve all 66 original items');
const seen = new Set();
for(const collection of ['programs','tools','record']) {
  const expected={programs:26,tools:19,record:21}[collection];
  const originals=roadmap.entries.filter(item=>item.collection===collection);
  assert.equal(originals.length,expected,`Missing original ${collection}`);
  const current=read(`dist/api/v1/${collection}.json`).data;
  for(const item of originals){
    const key=`${collection}/${item.id}`;assert.ok(!seen.has(key),`Duplicate ${key}`);seen.add(key);
    assert.ok(item.originalTitle&&item.originalBrief&&item.adaptation,`Incomplete mapping ${key}`);
    assert.ok(current.some(page=>page.id===item.id),`Missing current page ${key}`);
    assert.ok(existsSync(join(root,'dist',key,'index.html')),`Unbuilt roadmap page ${key}`);
  }
}
for(const kind of ['tools','benefits']) {
  const entries=read(`src/data/nonprofit-${kind}.json`), ids=new Set();
  assert.ok(entries.length>=15,`Incomplete ${kind} directory`);
  for(const entry of entries){
    assert.ok(!ids.has(entry.id),`Duplicate directory id ${entry.id}`);ids.add(entry.id);
    for(const field of ['id','name','category','summary','costType','cost','eligibility','limits','checked'])assert.ok(typeof entry[field]==='string'&&entry[field].trim(),`${entry.id}: missing ${field}`);
    assert.ok(['draft','reviewed'].includes(entry.review),`${entry.id}: missing review status`);
    assert.match(entry.checked,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new URL(entry.url).protocol,'https:');
    assert.ok(entry.sources.length>0,`${entry.id}: missing sources`);
    for(const source of entry.sources){assert.ok(source.label);assert.equal(new URL(source.url).protocol,'https:');}
  }
}
for(const path of ['tools/charity-os','for-charities','for-charities/tools','for-charities/benefits','contribute/review','roadmap'])assert.ok(existsSync(join(root,'dist',path,'index.html')),`Missing new page ${path}`);
console.log('✓ All 66 original items mapped to built pages; nonprofit directories and new routes validated.');
