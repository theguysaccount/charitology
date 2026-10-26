// Check the built sharing metadata against its actual committed media. In
// particular, a video URL alone is not a usable preview if the file is absent.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const read = (path) => readFileSync(path);
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const decode = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]));
const tags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(([tag]) => attributes(tag));
const meta = (html) => Object.fromEntries(tags(html, 'meta').map((tag) => [tag.property || tag.name, tag.content]));
const homeHtml = readFileSync(join(dist, 'index.html'), 'utf8');
const homeMeta = meta(homeHtml);
const home = new URL(homeMeta['og:url']);
const base = home.pathname.replace(/\/$/, '');
const localAsset = (ref) => {
  const url = new URL(ref, home);
  assert.equal(url.origin, home.origin, `Sharing asset must use the canonical site: ${ref}`);
  assert.ok(url.pathname.startsWith(`${base}/`), `Sharing asset is outside the deployment base: ${ref}`);
  return join(dist, decodeURIComponent(url.pathname.slice(base.length)));
};
const pngSize = (file) => {
  const data = read(file);
  assert.equal(data.subarray(1, 4).toString(), 'PNG', `Not a PNG: ${file}`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
function jpegSize(file) {
  const data = read(file);
  assert.equal(data.readUInt16BE(0), 0xffd8, `Not a JPEG: ${file}`);
  let at = 2;
  while (at < data.length) {
    assert.equal(data[at], 0xff, `Invalid JPEG marker: ${file}`);
    while (data[at] === 0xff) at++;
    const marker = data[at++];
    const size = data.readUInt16BE(at);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [data.readUInt16BE(at + 5), data.readUInt16BE(at + 3)];
    at += size;
  }
  throw new Error(`No JPEG dimensions found: ${file}`);
}
function boxes(data, start = 0, end = data.length) {
  const found = [];
  for (let at = start; at + 8 <= end;) {
    let size = data.readUInt32BE(at);
    const type = data.toString('ascii', at + 4, at + 8);
    let header = 8;
    if (size === 1) { size = Number(data.readBigUInt64BE(at + 8)); header = 16; }
    if (size === 0) size = end - at;
    assert.ok(size >= header && at + size <= end, `Invalid MP4 box ${type}`);
    found.push({ type, at, start: at + header, end: at + size });
    at += size;
  }
  return found;
}
function videoInfo(file) {
  const data = read(file);
  const top = boxes(data);
  const movie = top.find((box) => box.type === 'moov');
  const media = top.find((box) => box.type === 'mdat');
  assert.ok(top.some((box) => box.type === 'ftyp') && movie && media, 'MP4 must contain a file type, movie and media');
  assert.ok(movie.at < media.at, 'MP4 must be fast-start (movie metadata before media)');
  const contents = boxes(data, movie.start, movie.end);
  const header = contents.find((box) => box.type === 'mvhd');
  assert.ok(header, 'MP4 must declare its duration');
  const v1 = data[header.start] === 1;
  const timescale = data.readUInt32BE(header.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(data.readBigUInt64BE(header.start + 24)) : data.readUInt32BE(header.start + 16);
  const codec = data.indexOf(Buffer.from('avc1'), movie.start);
  assert.ok(codec > movie.start && codec < movie.end, 'MP4 must contain browser-compatible H.264 video');
  return { width: data.readUInt16BE(codec + 28), height: data.readUInt16BE(codec + 30), seconds: duration / timescale };
}

try {
  assert.equal(home.protocol, 'https:', 'Canonical sharing URL must use HTTPS');
  let pages = 0;
  for (const file of walk(dist).filter((file) => file.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const metadata = meta(html);
    const label = relative(dist, file);
    for (const field of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
      assert.ok(metadata[field], `${label} is missing ${field}`);
    }
    assert.equal(metadata['og:image:type'], 'image/jpeg', `${label}: incorrect image MIME type`);
    assert.equal(metadata['og:image:secure_url'], metadata['og:image'], `${label}: image HTTPS URL differs`);
    assert.equal(metadata['twitter:card'], 'summary_large_image', `${label}: keep a reliable image fallback`);
    assert.equal(metadata['twitter:image'], metadata['og:image'], `${label}: inconsistent image preview`);
    assert.deepEqual(jpegSize(localAsset(metadata['og:image'])), [Number(metadata['og:image:width']), Number(metadata['og:image:height'])], `${label}: image dimensions differ from metadata`);
    const icons = tags(html, 'link');
    assert.ok(icons.some((tag) => tag.rel === 'icon' && tag.type === 'image/svg+xml'), `${label}: missing adaptive favicon`);
    assert.ok(icons.some((tag) => tag.rel === 'icon' && tag.href.endsWith('.ico')), `${label}: missing ICO fallback`);
    for (const icon of icons.filter((tag) => ['icon', 'apple-touch-icon', 'manifest'].includes(tag.rel))) {
      assert.ok(statSync(localAsset(icon.href)).size > 0, `${label}: empty icon or manifest`);
    }
    pages++;
  }
  assert.deepEqual(jpegSize(localAsset(homeMeta['og:image'])), [1200, 630]);
  for (const field of ['og:video', 'og:video:secure_url', 'og:video:type', 'og:video:width', 'og:video:height', 'og:video:alt']) {
    assert.ok(homeMeta[field], `Home page is missing ${field}`);
  }
  assert.equal(homeMeta['og:video:type'], 'video/mp4');
  assert.equal(homeMeta['og:video:secure_url'], homeMeta['og:video']);
  const video = videoInfo(localAsset(homeMeta['og:video']));
  assert.deepEqual([video.width, video.height], [Number(homeMeta['og:video:width']), Number(homeMeta['og:video:height'])]);
  assert.ok(video.seconds >= 8 && video.seconds <= 15, 'Introduction must be a short, real video');
  for (const size of [16, 32, 48]) assert.deepEqual(pngSize(join(dist, `favicon-${size}.png`)), [size, size]);
  assert.deepEqual(pngSize(join(dist, 'apple-touch-icon.png')), [180, 180]);
  const manifest = JSON.parse(readFileSync(join(dist, 'site.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split('x')[0]);
    assert.deepEqual(pngSize(join(dist, icon.src)), [size, size]);
  }
  const ico = read(join(dist, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'Invalid ICO file');
  assert.equal(ico.readUInt16LE(4), 3, 'ICO must provide three small raster sizes');
  console.log(`✓ Social metadata and favicon assets checked across ${pages} pages; OG image 1200×630, H.264 video ${video.width}×${video.height}, ${video.seconds}s, fast-start.`);
} catch (error) {
  console.error(`✗ Social preview check failed: ${error.message}`);
  process.exit(1);
}
