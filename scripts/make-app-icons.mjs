// Renders the Kampus mark (src/components/brand/logo.tsx, the same drawing as
// scripts/make-icons.mjs) into the pictures the phone app is built with
// (mobile/app.config.ts, A-203). Run `node scripts/make-app-icons.mjs` after a
// change to the mark; the PNGs are committed.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const LAPIS = "#17234b";
const TURQUOISE = "#58d4d0";
const STAR =
  "M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z";

/** The star, `scale` of the 32-unit box, centred; the eye is cut in `eye` or left open. */
function star(scale, colour, eye) {
  const shift = (32 - 32 * scale) / 2;
  const hole = eye ? `<circle cx="16" cy="16" r="3" fill="${eye}"/>` : "";
  return `<g transform="translate(${shift} ${shift}) scale(${scale})">
    <path d="${STAR}${eye ? "" : " M19 16a3 3 0 1 0-6 0 3 3 0 0 0 6 0z"}" fill="${colour}" fill-rule="evenodd"/>
    ${hole}
  </g>`;
}

const svg = (body, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${
    background ? `<rect width="32" height="32" fill="${background}"/>` : ""
  }${body}</svg>`;

async function png(source, size, file) {
  const buffer = await sharp(Buffer.from(source), { density: 72 * (size / 32) })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(file, buffer);
  console.log(`${file} ${buffer.length} bytes`);
}

const out = "mobile/assets";
await mkdir(out, { recursive: true });
// iPhone, iPad and the stores: the full square tile; the system rounds the corners.
await png(svg(star(0.8, LAPIS, TURQUOISE), TURQUOISE), 1024, `${out}/icon.png`);
// Android adaptive icon: the launcher shows the middle two thirds under its own
// mask, so the star is drawn small on a see-through sheet; the turquoise sheet
// behind it is a colour in app.config.ts.
await png(svg(star(0.46, LAPIS, TURQUOISE)), 1024, `${out}/android-icon-foreground.png`);
// Android 13 "themed icons": one colour, the phone tints it.
await png(svg(star(0.46, "#000000", null)), 1024, `${out}/android-icon-monochrome.png`);
// Start-up picture: the rounded tile, shown small in the middle of the page colour.
const tile = `<rect width="32" height="32" rx="7" fill="${TURQUOISE}"/>${star(1, LAPIS, TURQUOISE)}`;
await png(svg(tile), 512, `${out}/splash-icon.png`);
await png(svg(tile), 96, `${out}/favicon.png`);
