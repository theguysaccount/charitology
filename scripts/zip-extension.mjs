// Packages extension/ into public/downloads/charitology-extension.zip so the site
// can offer it for download. It refreshes extension/checklist.json from
// src/data/checklist.json and bakes the deployed site address into the scripts.
// No dependencies: it writes a standard uncompressed ("stored") zip by hand.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, 'extension');
const site =
  (process.env.SITE_URL || 'https://charitology.org').replace(/\/$/, '') + (process.env.BASE_PATH || '/').replace(/\/$/, '');

const checklist = JSON.parse(readFileSync(join(root, 'src/data/checklist.json'), 'utf8'));
writeFileSync(
  join(ext, 'checklist.json'),
  `${JSON.stringify(checklist.map(({ question, detail }) => ({ question, detail })), null, 2)}\n`,
);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(ext)
  .filter((f) => !f.endsWith('README.md') && !relative(ext, f).split(sep).some((part) => part.startsWith('.')))
  .sort();

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Fixed timestamp (2026-01-01 00:00) so the zip is reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function packageZip(outName, browser) {
const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const name = relative(ext, file).split(sep).join('/');
  let data = readFileSync(file);
  if (name === 'manifest.json' && browser === 'chrome') {
    const manifest = JSON.parse(data.toString('utf8'));
    delete manifest.browser_specific_settings;
    data = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (name.endsWith('.js')) data = Buffer.from(data.toString('utf8').replaceAll('__CHARITOLOGY_SITE__', site));
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, data);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + data.length;
}

const centralSize = centrals.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, 'public/downloads');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, outName), Buffer.concat([...locals, ...centrals, end]));
console.log(`Packaged ${files.length} files for ${site} → public/downloads/${outName}`);
}

packageZip('charitology-extension.zip', 'firefox');
packageZip('charitology-firefox.zip', 'firefox');
packageZip('charitology-chrome.zip', 'chrome');
