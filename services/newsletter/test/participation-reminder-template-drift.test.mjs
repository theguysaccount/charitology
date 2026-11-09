import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('newsletter reminder template and pure dependencies are byte-exact repository-relative canonical OS copies',async()=>{
  for(const name of ['participation-reminder-template.mjs','security.mjs','participation-group-model.mjs']){
    const canonical=await readFile(new URL('../../charity-os/lib/'+name,import.meta.url));
    const vendored=await readFile(new URL('../lib/participation-reminder-template-v1/'+name,import.meta.url));
    assert.deepEqual(vendored,canonical,`The versioned reminder copy must match canonical OS ${name}`);
  }
});
