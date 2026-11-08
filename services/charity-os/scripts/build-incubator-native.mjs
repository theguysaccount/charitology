/** Deterministic one-producer admission build; --check never writes. */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
if (process.argv.slice(2).some(v => v !== '--check') || process.argv.filter(v => v === '--check').length > 1) throw Error('Use only optional --check.');
const hash = b => createHash('sha256').update(b).digest('hex');
const result = await build({ absWorkingDir: repo, entryPoints: ['services/charity-os/lib/incubator-native-entry.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', metafile: true, legalComments: 'inline', charset: 'utf8', logLevel: 'silent' });
const bytes = result.outputFiles[0].contents;
if (/(?:node:|\bimport\s*\()/u.test(new TextDecoder().decode(bytes))) throw Error('Incubator admission must remain inert browser-compatible code with no runtime imports.');
const sourceFiles = [];
for (const name of Object.keys(result.metafile.inputs).sort()) { const raw = await fs.readFile(path.join(repo, name)); sourceFiles.push({ path: name, byteLength: raw.length, sha256: hash(raw) }); }
const manifest = { format: 'charitology-incubator-native-admission', version: 1, sourceFiles, bundle: { byteLength: bytes.length, sha256: hash(bytes) } };
for (const [name, data] of new Map([['services/charity-os/lib/incubator-native-admission.mjs', bytes], ['services/charity-os/public/incubator-native-admission.js', bytes], ['services/charity-os/lib/incubator-native-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')]])) {
  const dest = path.join(repo, name);
  if (process.argv.includes('--check')) { if (!Buffer.from(data).equals(await fs.readFile(dest))) throw Error('Incubator generated admission differs: ' + name); }
  else await fs.writeFile(dest, data);
}
console.log(`Incubator native admission ${process.argv.includes('--check') ? 'checked' : 'generated'}: ${bytes.length} bytes, ${sourceFiles.length} actual source/dependency files.`);
