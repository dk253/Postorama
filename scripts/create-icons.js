#!/usr/bin/env node
/**
 * Generates placeholder menubar icon PNGs in assets/.
 * The SVG draws a minimal postcard outline — replace assets/ PNGs with
 * your final artwork at any time without touching any other code.
 *
 * Template image rules:
 *   - Black (#000) on transparent background
 *   - macOS inverts automatically for dark mode
 *   - 18×18 px @1x,  36×36 px @2x
 *
 * Run once:  node scripts/create-icons.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

// Minimal postcard SVG — a rectangle with a small stamp square in the top-right
function postcardSvg(size) {
  const s = size;
  const pad = Math.round(s * 0.1);
  const strokeW = Math.max(1, Math.round(s * 0.07));
  const stampSize = Math.round(s * 0.28);
  const stampX = s - pad - stampSize;
  const stampY = pad;
  const divX = Math.round(s * 0.52);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <!-- card outline -->
  <rect x="${pad}" y="${pad + 1}" width="${s - pad * 2}" height="${s - pad * 2 - 2}"
        rx="${strokeW}" ry="${strokeW}"
        fill="none" stroke="black" stroke-width="${strokeW}"/>
  <!-- centre divider line -->
  <line x1="${divX}" y1="${pad + 3}" x2="${divX}" y2="${s - pad - 3}"
        stroke="black" stroke-width="${Math.max(1, Math.round(strokeW * 0.6))}"/>
  <!-- stamp placeholder -->
  <rect x="${stampX}" y="${stampY + 2}" width="${stampSize}" height="${stampSize}"
        fill="none" stroke="black" stroke-width="${Math.max(1, Math.round(strokeW * 0.7))}"/>
</svg>`;
}

async function generate(filename, size) {
  const svg = Buffer.from(postcardSvg(size));
  const dest = path.join(assetsDir, filename);
  await sharp(svg).png().toFile(dest);
  console.log(`  created ${filename} (${size}×${size})`);
}

(async () => {
  console.log('Generating menubar icons…');
  await generate('menubar-idle.png', 18);
  await generate('menubar-idle@2x.png', 36);
  // Larger app icon placeholder (512×512)
  await generate('icon.png', 512);
  console.log('Done. Replace assets/*.png with your final artwork when ready.');
})().catch((err) => { console.error(err); process.exit(1); });
