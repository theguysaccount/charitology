import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('actual exported validator signatures and closed commands satisfy strict TypeScript fixtures', () => {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const result = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--strict', '--noEmit',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck',
    'src/lib/model-bundles/types.fixture.ts'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
