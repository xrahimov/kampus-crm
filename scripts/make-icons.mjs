// Renders the Kampus mark (src/components/brand/logo.tsx) into the PNG icons the
// web-app manifest and iPhones need. Run `node scripts/make-icons.mjs` after a
// change to the mark; the PNGs are committed.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const LAPIS = "#17234b";
const TURQUOISE = "#58d4d0";
const STAR =
  "M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z";

/** The mark as on the sidebar: turquoise tile, lapis star. `pad` shrinks the star for maskable icons. */
function markSvg({ rounded, pad }) {
  const scale = 1 - pad * 2;
  const shift = 32 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="${TURQUOISE}"/>
  <g transform="translate(${shift} ${shift}) scale(${scale})">
    <path d="${STAR}" fill="${LAPIS}"/>
    <circle cx="16" cy="16" r="3" fill="${TURQUOISE}"/>
  </g>
</svg>`;
}

async function png(svg, size, file) {
  const buffer = await sharp(Buffer.from(svg), { density: 72 * (size / 32) })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(file, buffer);
  console.log(`${file} ${buffer.length} bytes`);
}

await mkdir("public/icons", { recursive: true });
await png(markSvg({ rounded: true, pad: 0 }), 192, "public/icons/icon-192.png");
await png(markSvg({ rounded: true, pad: 0 }), 512, "public/icons/icon-512.png");
await png(markSvg({ rounded: false, pad: 0.1 }), 512, "public/icons/icon-maskable-512.png");
await png(markSvg({ rounded: false, pad: 0 }), 180, "public/icons/apple-touch-icon.png");
