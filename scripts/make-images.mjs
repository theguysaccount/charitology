// Generate committed brand assets from the site's one compass geometry.
// macOS: npm run images. To also rebuild the 10-second silent MP4:
// FFMPEG=/path/to/ffmpeg npm run images -- --video
// Quick Look and sips ship with macOS. ffmpeg must provide libx264.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mark, COLORS, socialSvg } from './social-art.mjs';
import { markSvg } from '../src/lib/mark.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'charitology-media-'));
const publicDir = join(root, 'public');
const video = process.argv.includes('--video');

function render(svg, name, size) {
  const file = join(tmp, `${name}.svg`);
  writeFileSync(file, svg);
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, file], { stdio: 'ignore' });
  return `${file}.png`;
}
function resize(src, dest, px) {
  copyFileSync(src, dest);
  execFileSync('sips', ['-z', String(px), String(px), dest], { stdio: 'ignore' });
}
function ico(files) {
  const buffers = files.map((file) => readFileSync(file));
  const header = Buffer.alloc(6 + files.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(files.length, 4);
  let offset = header.length;
  files.forEach((_, i) => {
    const size = [16, 32, 48][i];
    const at = 6 + i * 16;
    header[at] = size; header[at + 1] = size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(buffers[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += buffers[i].length;
  });
  return Buffer.concat([header, ...buffers]);
}

try {
  mkdirSync(join(publicDir, 'social'), { recursive: true });
  const ogPng = render(socialSvg(), 'og', 1200);
  execFileSync('sips', ['--cropToHeightWidth', '630', '1200', ogPng], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '91', ogPng, '--out', join(publicDir, 'og.jpg')], { stdio: 'ignore' });
  copyFileSync(join(publicDir, 'og.jpg'), join(publicDir, 'social/intro-poster.jpg'));

  const icon = (simple = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${COLORS.paper}"/>${mark(40, 40, 432, simple ? 'small-icon' : 'icon', { simple })}</svg>`;
  const fullIcon = render(icon(), 'icon', 512);
  const smallIcon = render(icon(true), 'icon-small', 512);
  resize(fullIcon, join(publicDir, 'apple-touch-icon.png'), 180);
  for (const px of [192, 512]) resize(fullIcon, join(publicDir, `icon-${px}.png`), px);
  const faviconFiles = [16, 32, 48].map((px) => {
    const file = join(publicDir, `favicon-${px}.png`);
    resize(px < 48 ? smallIcon : fullIcon, file, px);
    return file;
  });
  writeFileSync(join(publicDir, 'favicon.ico'), ico(faviconFiles));
  const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>:root{--i:#1a1915;--p:#f6f3ec;--a:#8b1e2d;--b:#5c1019}@media(prefers-color-scheme:dark){:root{--i:#efebe3;--p:#121110;--a:#d96d7b;--b:#b44455}}</style>${markSvg({ id: 'favicon', simple: true, ink: 'var(--i)', accent: 'var(--a)', accent2: 'var(--b)', pivot: 'var(--p)' })}</svg>`;
  writeFileSync(join(publicDir, 'favicon.svg'), adaptive);
  writeFileSync(join(publicDir, 'site.webmanifest'), JSON.stringify({
    name: 'Charitology', short_name: 'Charitology', description: 'The science of doing the most good.',
    icons: [192, 512].map((size) => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
    theme_color: COLORS.paper, background_color: COLORS.paper, display: 'browser',
  }, null, 2) + '\n');
  mkdirSync(join(root, 'extension/icons'), { recursive: true });
  for (const px of [16, 32, 48, 128]) resize(px < 48 ? smallIcon : fullIcon, join(root, `extension/icons/icon-${px}.png`), px);
  console.log('Wrote OG card and poster, adaptive SVG + PNG/ICO favicons, app/touch icons and extension icons.');

  if (video) {
    const ffmpeg = process.env.FFMPEG || 'ffmpeg';
    // Render at 24 fps, then encode browser-compatible H.264, 4:2:0, fast-start.
    // The mark settles into the same final geometry as the static social card.
    const fps = 24, seconds = 10;
    for (let frame = 0; frame < fps * seconds; frame++) {
      const name = `frame-${String(frame).padStart(4, '0')}`;
      render(socialSvg(frame / fps), name, 1200);
      rmSync(join(tmp, `${name}.svg`));
      if (frame % 48 === 0) console.log(`Rendering video: ${frame / fps}/${seconds} seconds`);
    }
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps), '-i', join(tmp, 'frame-%04d.svg.png'), '-vf', 'crop=1200:630:0:285', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-metadata', 'title=Charitology — the science of doing the most good', '-metadata', 'comment=Original compass artwork. Silent 10-second introduction.', join(publicDir, 'social/charitology-intro.mp4')], { stdio: 'inherit' });
    console.log('Wrote public/social/charitology-intro.mp4 (1200×630, H.264, 24 fps, 10 seconds).');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
