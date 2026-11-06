// Renders the Kampus mark (src/components/brand/logo.tsx) into the PNG icons the
// web-app manifest and iPhones need. Run `node scripts/make-icons.mjs` after a
// change to the mark; the PNGs are committed.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const LAPIS = "#17234b";
const TURQUOISE = "#58d4d0";
const STAR =
  "M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z";

/**
 * The mark as on the sidebar: turquoise tile, lapis star. `pad` shrinks the star
 * for maskable icons. The student app (A-173) wears the same mark inverted: a
 * lapis tile with a turquoise star, so the two icons sit apart on a home screen.
 */
function markSvg({ rounded, pad, student = false }) {
  const scale = 1 - pad * 2;
  const shift = 32 * pad;
  const tile = student ? LAPIS : TURQUOISE;
  const star = student ? TURQUOISE : LAPIS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="${tile}"/>
  <g transform="translate(${shift} ${shift}) scale(${scale})">
    <path d="${STAR}" fill="${star}"/>
    <circle cx="16" cy="16" r="3" fill="${tile}"/>
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
// `node scripts/make-icons.mjs student` renders only the student app's icons.
if (process.argv[2] !== "student") {
  await png(markSvg({ rounded: true, pad: 0 }), 192, "public/icons/icon-192.png");
  await png(markSvg({ rounded: true, pad: 0 }), 512, "public/icons/icon-512.png");
  await png(markSvg({ rounded: false, pad: 0.1 }), 512, "public/icons/icon-maskable-512.png");
  await png(markSvg({ rounded: false, pad: 0 }), 180, "public/icons/apple-touch-icon.png");
}
if (process.argv[2] !== "staff") {
  const student = (rounded, pad) => markSvg({ rounded, pad, student: true });
  await png(student(true, 0), 192, "public/icons/student-192.png");
  await png(student(true, 0), 512, "public/icons/student-512.png");
  await png(student(false, 0.1), 512, "public/icons/student-maskable-512.png");
  await png(student(false, 0), 180, "public/icons/student-apple-touch-icon.png");
}
