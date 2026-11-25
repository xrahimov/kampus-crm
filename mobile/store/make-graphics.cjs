/*
 * Draws the two pictures Google Play asks for beside the screenshots (A-268):
 *
 *   icon-512.png      the store's icon, 512 x 512 (Play rounds the corners itself)
 *   feature.png       the "feature graphic", 1024 x 500, no transparency
 *
 * Both come from the app's own icon and the star-and-cross wall of the sign-in
 * page, so the store page looks like the app. Run from the repository root,
 * where Playwright is installed:
 *
 *   node mobile/store/make-graphics.cjs
 */
/* global __dirname */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const HERE = __dirname;
const LAPIS = "#17234b";
const TURQUOISE = "#58d4d0";
const PORCELAIN = "#f7f9fc";

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
const ICON = dataUrl(path.join(HERE, "../assets/icon.png"), "image/png");
const ONEST = dataUrl(
  path.join(HERE, "../node_modules/@expo-google-fonts/onest/600SemiBold/Onest_600SemiBold.ttf"),
  "font/ttf",
);

/* The wall's tile, as the site and the app draw it: an eight-pointed star, 96 wide. */
const TILE = 96;
const R = TILE / 2;
const INNER = R * (Math.SQRT1_2 / Math.cos(Math.PI / 8));
const STAR = Array.from({ length: 16 }, (_, k) => {
  const radius = k % 2 === 0 ? R : INNER;
  const angle = (k * Math.PI) / 8;
  return `${(R + radius * Math.cos(angle)).toFixed(2)},${(R + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

const wall = (id, fill, stroke) => `
  <svg class="wall ${id}" width="1024" height="500">
    <defs>
      <pattern id="${id}" width="${TILE}" height="${TILE}" patternUnits="userSpaceOnUse"
        patternTransform="translate(22 6) rotate(45)">
        <polygon points="${STAR}" fill="${fill}" stroke="${stroke}" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#${id})" />
  </svg>`;

const FEATURE = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Onest; src: url(${ONEST}); font-weight: 600; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1024px; height: 500px; background: ${LAPIS}; overflow: hidden; position: relative; }
  .wall { position: absolute; inset: 0; }
  /* A band of daylight crosses the wall, as on the sign-in page. */
  .day { -webkit-mask-image: linear-gradient(115deg, transparent 46%, #000 68%, #000 80%, transparent 97%);
         mask-image: linear-gradient(115deg, transparent 46%, #000 68%, #000 80%, transparent 97%); }
  .name { position: absolute; left: 84px; top: 0; bottom: 0; display: flex; align-items: center; gap: 30px; }
  .name img { width: 132px; height: 132px; border-radius: 30px; }
  .name span { font: 600 104px/1 Onest, sans-serif; letter-spacing: -0.035em; color: ${PORCELAIN}; }
</style></head><body>
  ${wall("base", "rgba(255,255,255,0.04)", "rgba(88,212,208,0.22)")}
  ${wall("day", "rgba(88,212,208,0.20)", "rgba(88,212,208,0.75)")}
  <div class="name"><img src="${ICON}" alt=""><span>Kampus</span></div>
</body></html>`;

const ICON_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; } body { width: 512px; height: 512px; background: ${TURQUOISE}; }
  img { width: 512px; height: 512px; display: block; }
</style></head><body><img src="${ICON}" alt=""></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const shot = async (html, width, height, file) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(HERE, file), omitBackground: false });
    await page.close();
  };
  await shot(FEATURE, 1024, 500, "feature.png");
  await shot(ICON_PAGE, 512, 512, "icon-512.png");
  await browser.close();
})();
