/**
 * The camera of the tutorial videos: one `Film` is one video.
 *
 * It records what a browser page shows as sharp frames (the browser itself is
 * scaled up, so a 1440×720 page arrives as 1920×960 pictures), draws a pointer
 * the viewer can follow, keeps the caption of every step with its time, and at
 * the end has ffmpeg put the frames together: the page on top, a band with the
 * caption under it, 1920×1080 in all.
 *
 * Time that passes inside `offCamera()` is cut out, so signing in or preparing
 * demo rows never shows.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";

/** The page as the viewer sees it, in CSS pixels, and the picture it becomes. */
export const DESKTOP = { width: 1440, height: 720 } as const;
export const PHONE = { width: 430, height: 720 } as const;
const PICTURE = { width: 1920, height: 960 } as const;
const BAND = 120;
const SCALE = PICTURE.width / DESKTOP.width;
const FPS = 30;

/** Samarkand palette of the app: the lapis of the sidebar, the turquoise of its active edge. */
const LAPIS = "#1B2452";
const BACKDROP = "#E9ECF5";

export type View = { width: number; height: number };

/**
 * A browser whose window is exactly `view` and whose pixels are scaled up, so
 * frames come out at video size. `args` adds Chromium switches (the video
 * lesson needs a made-up camera).
 */
export async function launch(view: View = DESKTOP, args: string[] = []): Promise<Browser> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return chromium.launch({
    ...(executablePath ? { executablePath } : { channel: "chromium" }),
    args: [
      `--force-device-scale-factor=${SCALE}`,
      // The window is taller than the page by the browser's own bars; `fit` corrects the rest.
      `--window-size=${view.width},${view.height + 87}`,
      "--hide-scrollbars",
      ...args,
    ],
  });
}

/** A page of exactly `view`, with the pointer and the highlight ring drawn into every document. */
export async function open(
  browser: Browser,
  view: View = DESKTOP,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({ viewport: null, ...options });
  await context.addInitScript(POINTER_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await fit(page, view);
  return [context, page];
}

/** Makes the page's inner size exactly `view` by resizing the window around it. */
export async function fit(page: Page, view: View) {
  const cdp = await page.context().newCDPSession(page);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const inner = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      if (inner.w === view.width && inner.h === view.height) return;
      const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: {
          width: (bounds.width ?? view.width) + view.width - inner.w,
          height: (bounds.height ?? view.height) + view.height - inner.h,
        },
      });
      await page.waitForTimeout(150);
    }
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

/**
 * Runs in every document before the page's own code: a pointer that follows
 * the mouse, a ripple on every press, and `__tutorial.ring()` to circle an
 * element. Kept as text, not as a function: a function would be rewritten by
 * the TypeScript runner and arrive in the page with helpers it does not have.
 */
const POINTER_SCRIPT = String.raw`(() => {
  if (window.__tutorial || window.top !== window) return;
  const css = [
    "#tv-pointer { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;",
    "  width: 26px; height: 26px; margin: -3px 0 0 -5px; opacity: 0; will-change: transform;",
    "  filter: drop-shadow(0 2px 3px rgb(0 0 0 / .35)); }",
    ".tv-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;",
    "  margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid rgb(20 170 160 / .9);",
    "  background: rgb(20 170 160 / .18); animation: tv-ripple .55s ease-out forwards; }",
    "@keyframes tv-ripple { from { transform: scale(.25); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }",
    ".tv-ring { position: fixed; z-index: 2147483645; pointer-events: none; border-radius: 12px;",
    "  border: 3px solid rgb(20 170 160); box-shadow: 0 0 0 5px rgb(20 170 160 / .22), 0 0 22px rgb(20 170 160 / .45);",
    "  animation: tv-ring .45s ease-out both; transition: opacity .3s; }",
    "@keyframes tv-ring { from { transform: scale(1.12); opacity: 0 } to { transform: scale(1); opacity: 1 } }",
  ].join("\n");
  let pointer = null;
  // React keeps <html> and <body> to itself while it hydrates, so the pointer is
  // put back whenever the page has dropped it.
  const home = () => document.body || document.documentElement;
  const mount = () => {
    if ((pointer && pointer.isConnected) || !home()) return;
    if (!document.getElementById("tv-style")) {
      const style = document.createElement("style");
      style.id = "tv-style";
      style.textContent = css;
      (document.head || home()).append(style);
    }
    const last = pointer && pointer.style.transform;
    pointer = document.createElement("div");
    pointer.id = "tv-pointer";
    pointer.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3l14 8.2-6.3 1.5 3.7 6.6-2.6 1.4-3.7-6.6L5 18.6z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    if (last) {
      pointer.style.transform = last;
      pointer.style.opacity = "1";
    }
    home().append(pointer);
  };
  setInterval(mount, 200);
  const place = (x, y) => {
    mount();
    if (!pointer) return;
    pointer.style.opacity = "1";
    pointer.style.transform = "translate(" + x + "px, " + y + "px)";
  };
  window.addEventListener("mousemove", (e) => place(e.clientX, e.clientY), true);
  window.addEventListener(
    "mousedown",
    (e) => {
      mount();
      const ripple = document.createElement("div");
      ripple.className = "tv-ripple";
      ripple.style.left = e.clientX + "px";
      ripple.style.top = e.clientY + "px";
      home().append(ripple);
      setTimeout(() => ripple.remove(), 600);
    },
    true,
  );
  window.__tutorial = {
    place,
    ring(box, ms) {
      mount();
      const ring = document.createElement("div");
      ring.className = "tv-ring";
      const pad = 6;
      ring.style.left = box.x - pad + "px";
      ring.style.top = box.y - pad + "px";
      ring.style.width = box.width + pad * 2 + "px";
      ring.style.height = box.height + pad * 2 + "px";
      home().append(ring);
      setTimeout(() => (ring.style.opacity = "0"), ms);
      setTimeout(() => ring.remove(), ms + 320);
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();`;

type Frame = { file: string; at: number };
type Segment = { frames: Frame[]; from: number; to: number };
type Caption = { from: number; to: number; text: string };

export class Film {
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private segments: Segment[] = [];
  private captions: Caption[] = [];
  private latest: string | null = null;
  private count = 0;
  /** Wall-clock milliseconds cut out so far, and when the current cut began. */
  private cut = 0;
  private cutSince: number | null = null;
  private gone = false;
  private began = Date.now();
  private pointer = { x: DESKTOP.width / 2, y: DESKTOP.height / 2 };
  private readonly onLoaded = () => {
    void this.page?.mouse.move(this.pointer.x, this.pointer.y).catch(() => undefined);
  };

  constructor(
    /** A folder of its own for the frames; emptied first and removed after `finish`. */
    private readonly dir: string,
    /** How long a caption of this text has to stay, in seconds. */
    private readonly readTime: (text: string) => number = (text) =>
      Math.max(2.4, 1 + text.length / 16),
  ) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  /** Seconds of video so far. */
  now(): number {
    const wall = this.cutSince ?? Date.now();
    return (wall - this.began - this.cut) / 1000;
  }

  /** Points the camera at `page`; whatever was filmed before stays in the video. */
  async watch(page: Page) {
    await this.unwatch();
    this.page = page;
    // The video starts with its first picture, not when the film was made.
    if (this.segments.length === 0) {
      this.began = Date.now();
      this.cut = 0;
    }
    this.segments.push({ frames: [], from: this.now(), to: this.now() });
    this.latest = null;
    page.on("domcontentloaded", this.onLoaded);
    const cdp = await page.context().newCDPSession(page);
    this.cdp = cdp;
    cdp.on("Page.screencastFrame", (frame) => {
      if (this.gone) return;
      const file = path.join(this.dir, `f${String(this.count++).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(frame.data, "base64"));
      this.latest = file;
      if (this.cutSince === null) this.segments.at(-1)!.frames.push({ file, at: this.now() });
      void cdp
        .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
        .catch(() => undefined);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
    // A page at rest sends nothing: nudge it so the segment opens with a picture.
    await this.nudge();
  }

  private async unwatch() {
    if (!this.page || !this.cdp) return;
    this.segments.at(-1)!.to = this.now();
    this.page.off("domcontentloaded", this.onLoaded);
    await this.cdp.send("Page.stopScreencast").catch(() => undefined);
    await this.cdp.detach().catch(() => undefined);
    this.page = null;
    this.cdp = null;
  }

  /** Forces one fresh frame out of a page that is standing still. */
  private async nudge() {
    const page = this.need();
    await page
      .evaluate(
        () =>
          new Promise<void>((done) => {
            const dot = document.createElement("div");
            dot.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01";
            document.documentElement.append(dot);
            requestAnimationFrame(() => requestAnimationFrame(() => (dot.remove(), done())));
          }),
      )
      .catch(() => undefined);
    await page.waitForTimeout(120);
  }

  private need(): Page {
    if (!this.page) throw new Error("the film is not watching a page");
    return this.page;
  }

  /** Runs `work` without filming it: its time is cut from the video. */
  async offCamera<T>(work: () => Promise<T>): Promise<T> {
    if (this.cutSince !== null) return work();
    this.cutSince = Date.now();
    try {
      return await work();
    } finally {
      if (this.page) {
        await this.page.waitForLoadState("networkidle").catch(() => undefined);
        await this.nudge();
      }
      this.cut += Date.now() - this.cutSince;
      this.cutSince = null;
      // The video goes on with the page as it stands now.
      if (this.latest) this.segments.at(-1)!.frames.push({ file: this.latest, at: this.now() });
    }
  }

  /**
   * One step of the lesson: `text` appears under the picture, `work` is done
   * on screen, and the step lasts at least as long as the text takes to read.
   */
  async step(text: string, work?: () => Promise<void>, extra = 0) {
    const from = this.now();
    const caption: Caption = { from, to: from, text };
    this.captions.push(caption);
    try {
      // A beat to start reading before anything moves.
      await this.wait(0.7);
      if (work) await work();
      const left = this.readTime(text) + extra - (this.now() - from);
      // Work that ran long still leaves its result on screen for a moment.
      await this.wait(Math.max(left, 1.1));
    } finally {
      caption.to = this.now();
    }
  }

  async wait(seconds: number) {
    const ms = seconds * 1000;
    // A page that was closed (the end of a scene with browsers of its own) still lets time pass.
    if (!this.page || this.page.isClosed()) await new Promise((done) => setTimeout(done, ms));
    else await this.page.waitForTimeout(ms);
  }

  /* ----- the hand: everything the viewer sees being done --------------------------------- */

  /** Glides the pointer to a point of the page. */
  async glide(x: number, y: number) {
    const page = this.need();
    const from = { ...this.pointer };
    const distance = Math.hypot(x - from.x, y - from.y);
    if (distance < 2) return;
    const ms = Math.min(900, 260 + distance * 0.55);
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.pointer = { x: from.x + (x - from.x) * eased, y: from.y + (y - from.y) * eased };
      await page.mouse.move(this.pointer.x, this.pointer.y);
      await page.waitForTimeout(12);
    }
  }

  private async centre(
    target: Locator,
  ): Promise<{ x: number; y: number; box: { x: number; y: number } }> {
    await target.first().waitFor({ state: "visible" });
    const view = await this.inner();
    let box = await target.first().boundingBox();
    // Only what is out of sight is scrolled to: a tall panel whose top shows stays where it is.
    if (!box || box.y < 0 || box.y + Math.min(box.height, 90) > view.height) {
      await target.first().scrollIntoViewIfNeeded();
      await this.need().waitForTimeout(350);
      box = await target.first().boundingBox();
    }
    if (!box) throw new Error("nothing to point at");
    return {
      x: Math.min(Math.max(box.x + box.width / 2, 4), view.width - 4),
      y: Math.min(Math.max(box.y + Math.min(box.height / 2, 60), 4), view.height - 4),
      box,
    };
  }

  private inner() {
    return this.need().evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  }

  /** Moves the pointer onto `target` without pressing. */
  async hover(target: Locator) {
    const { x, y } = await this.centre(target);
    await this.glide(x, y);
  }

  /** Moves onto `target` and draws a ring around it for a moment. */
  async show(target: Locator, seconds = 1.6) {
    await this.hover(target);
    const box = await target.first().boundingBox();
    if (!box) return;
    await this.need().evaluate(
      ([b, ms]) =>
        (
          window as unknown as {
            __tutorial?: { ring: (b: unknown, ms: number) => void };
          }
        ).__tutorial?.ring(b, ms as number),
      [box, seconds * 1000] as const,
    );
    await this.wait(seconds);
  }

  /** Moves onto `target` and presses it. */
  async click(target: Locator) {
    const { x, y, box } = await this.centre(target);
    await this.glide(x, y);
    await this.wait(0.25);
    // Playwright's own click waits until the element can take it; it lands where the pointer is.
    // A link that wraps onto two lines has gaps in its box: there Playwright picks the point itself.
    await target
      .first()
      .click({ position: { x: x - box.x, y: y - box.y }, timeout: 4000 })
      .catch(() => target.first().click());
    await this.wait(0.45);
  }

  /** Presses `target` and types `text` into it the way a person would. */
  async type(target: Locator, text: string) {
    await this.click(target);
    await target.first().fill("");
    await target.first().pressSequentially(text, { delay: 55 });
    await this.wait(0.3);
  }

  /** Presses `target` and sets its value at once: for date and time fields, which do not take typing. */
  async set(target: Locator, value: string) {
    await this.click(target);
    await target.first().fill(value);
    await this.wait(0.4);
  }

  /** Scrolls the page by `dy` pixels, smoothly. */
  async scroll(dy: number) {
    const page = this.need();
    const steps = Math.max(6, Math.round(Math.abs(dy) / 28));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy / steps);
      await page.waitForTimeout(16);
    }
    await this.wait(0.3);
  }

  /** Brings `target` to about a third of the way down the page. */
  async bring(target: Locator) {
    const box = await target.first().boundingBox();
    if (!box) return;
    const { height } = await this.inner();
    const dy = box.y - height * 0.3;
    if (Math.abs(dy) > 40) await this.scroll(dy);
  }

  /** The opening card: the video's number and name on lapis, filmed for `seconds`. */
  async title(card: { index: string; title: string; note: string }, seconds = 3.2) {
    const page = this.need();
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      ${onest()}
      html, body { margin: 0; height: 100%; }
      body { font-family: Onest, Inter, sans-serif; background: ${LAPIS}; color: #fff; overflow: hidden;
        display: grid; place-items: center; }
      .tiles { position: absolute; inset: 0; opacity: .08;
        background: repeating-conic-gradient(from 45deg, #fff 0 25%, transparent 0 50%) 0 0 / 96px 96px; }
      main { position: relative; width: 980px; animation: rise .7s cubic-bezier(.2,.8,.2,1) both; }
      .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; color: #cfd6f3; }
      .index { margin-top: 44px; font-size: 20px; font-weight: 600; letter-spacing: .04em; color: #5fd6cb; }
      h1 { margin: 10px 0 0; font-size: 62px; line-height: 1.08; font-weight: 700; letter-spacing: -.02em; }
      .note { margin-top: 22px; font-size: 24px; line-height: 1.45; color: #cfd6f3; max-width: 820px; }
      .bar { margin-top: 40px; width: 96px; height: 6px; border-radius: 3px; background: #35c2b6;
        transform-origin: left; animation: grow .9s .25s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes rise { from { opacity: 0; transform: translateY(18px) } }
      @keyframes grow { from { transform: scaleX(0) } }
    </style>
    <div class="tiles"></div>
    <main>
      <div class="brand"><svg viewBox="0 0 32 32" width="40" height="40"><rect width="32" height="32" rx="7" fill="#35c2b6"/>
        <path d="M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z" fill="${LAPIS}"/>
        <circle cx="16" cy="16" r="3" fill="#35c2b6"/></svg>Kampus</div>
      <div class="index">${esc(card.index)}</div>
      <h1>${esc(card.title)}</h1>
      <div class="note">${esc(card.note)}</div>
      <div class="bar"></div>
    </main>`);
    await this.wait(seconds);
  }

  /** Throws the frames away: for a video that will not be finished. */
  async discard() {
    await this.unwatch();
    this.gone = true;
    rmSync(this.dir, { recursive: true, force: true });
  }

  /* ----- the cutting room ----------------------------------------------------------------- */

  /**
   * Writes `<out>.mp4` (the page, the caption band, a silent sound track so
   * that messengers treat it as a video) and `<out>.srt` (the same captions as
   * a subtitle file). Returns the length in seconds.
   */
  async finish(out: string): Promise<number> {
    await this.unwatch();
    const total = this.now();
    const parts: string[] = [];
    this.segments
      .filter((s) => s.frames.length > 0 && s.to - s.from > 0.05)
      .forEach((segment, i) => {
        const list = path.join(this.dir, `seg${i}.txt`);
        const lines: string[] = [];
        segment.frames.forEach((frame, j) => {
          const next = segment.frames[j + 1]?.at ?? segment.to;
          const start = j === 0 ? segment.from : frame.at;
          lines.push(
            `file '${frame.file}'`,
            `duration ${Math.max(next - start, 0.001).toFixed(4)}`,
          );
        });
        // The concat reader drops the last duration unless the picture is named once more.
        lines.push(`file '${segment.frames.at(-1)!.file}'`);
        writeFileSync(list, lines.join("\n"));
        const part = path.join(this.dir, `seg${i}.mp4`);
        ffmpeg([
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          list,
          "-vf",
          `fps=${FPS},scale=-2:${PICTURE.height}:flags=lanczos,` +
            `pad=${PICTURE.width}:${PICTURE.height}:(ow-iw)/2:0:color=${BACKDROP}`,
          "-t",
          (segment.to - segment.from).toFixed(3),
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "8",
          "-pix_fmt",
          "yuv420p",
          part,
        ]);
        parts.push(part);
      });
    const joined = path.join(this.dir, "parts.txt");
    writeFileSync(joined, parts.map((p) => `file '${p}'`).join("\n"));
    const band = await captionBand(this.captions, total, this.dir);
    mkdirSync(path.dirname(out), { recursive: true });
    ffmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      joined,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      band,
      "-filter_complex",
      `[2:v]fps=${FPS},format=yuv420p[band];[0:v][band]vstack=inputs=2:shortest=1[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a",
      "-t",
      total.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "21",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "48k",
      "-movflags",
      "+faststart",
      `${out}.mp4`,
    ]);
    writeFileSync(`${out}.srt`, srtFile(this.captions));
    rmSync(this.dir, { recursive: true, force: true });
    return total;
  }
}

function ffmpeg(args: string[]) {
  // FFMPEG_PATH names the program where it is not on the PATH (any build with libx264 will do).
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-v", "error", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

const esc = (text: string) =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** The app's own typeface, carried inside the page so no machine has to have it installed. */
function onest(): string {
  const files = path.join(process.cwd(), "node_modules/@fontsource-variable/onest/files");
  const face = (name: string, range: string) =>
    `@font-face { font-family: Onest; font-weight: 100 900; unicode-range: ${range};
      src: url(data:font/woff2;base64,${readFileSync(path.join(files, name)).toString("base64")}) format("woff2"); }`;
  return [
    face("onest-latin-wght-normal.woff2", "U+0000-00FF, U+02BB-02BC, U+2000-206F"),
    face("onest-latin-ext-wght-normal.woff2", "U+0100-02BA, U+02BD-02FF"),
    face("onest-cyrillic-wght-normal.woff2", "U+0400-04FF, U+2116"),
  ].join("\n");
}

/**
 * The band under the picture as a list of still pictures with their times:
 * every caption is drawn by the browser (the app's typeface, two balanced
 * lines, smaller when a sentence is long), with the bare band between them.
 * Returns the list file ffmpeg reads.
 */
async function captionBand(captions: Caption[], total: number, dir: string): Promise<string> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch(
    executablePath ? { executablePath } : { channel: "chromium" },
  );
  const lines: string[] = [];
  try {
    const page = await browser.newPage({
      viewport: { width: PICTURE.width, height: BAND },
      deviceScaleFactor: 1,
    });
    const draw = async (text: string, file: string) => {
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>
        ${onest()}
        html, body { margin: 0; height: 100%; }
        body { background: ${LAPIS}; color: #fff; display: grid; place-items: center; overflow: hidden;
          font-family: Onest, Inter, sans-serif; }
        p { margin: 0; max-width: ${PICTURE.width - 160}px; text-align: center; font-size: 38px;
          line-height: 1.24; font-weight: 500; text-wrap: balance; }
      </style><p>${esc(text)}</p>`);
      await page.evaluate(async (room) => {
        await document.fonts.ready;
        const p = document.querySelector("p")!;
        for (let size = 38; size > 24 && p.offsetHeight > room; size--) {
          p.style.fontSize = `${size - 1}px`;
        }
      }, BAND - 16);
      await page.screenshot({ path: file });
    };
    const bare = path.join(dir, "band.png");
    await draw("", bare);
    const still = (file: string, seconds: number) => {
      if (seconds > 0.001) lines.push(`file '${file}'`, `duration ${seconds.toFixed(4)}`);
    };
    let at = 0;
    const shown = captions.filter((c) => c.text && c.to > c.from);
    for (const [i, caption] of shown.entries()) {
      const file = path.join(dir, `band${i}.png`);
      await draw(caption.text, file);
      still(bare, caption.from - at);
      still(file, caption.to - Math.max(caption.from, at));
      at = Math.max(at, caption.to);
    }
    // A little longer than the picture: the picture decides where the video ends.
    still(bare, Math.max(total - at, 0) + 1);
    lines.push(`file '${bare}'`);
  } finally {
    await browser.close();
  }
  const list = path.join(dir, "band.txt");
  writeFileSync(list, lines.join("\n"));
  return list;
}

/** A caption on at most two lines of about the same length. */
function twoLines(text: string): string[] {
  if (text.length <= 78) return [text];
  const words = text.split(" ");
  let best = 1;
  let gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(" ").length;
    const diff = Math.abs(first - (text.length - first));
    if (diff < gap) {
      gap = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`;
}

function srtFile(captions: Caption[]): string {
  return captions
    .filter((c) => c.text && c.to > c.from)
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${twoLines(c.text).join("\n")}\n`,
    )
    .join("\n");
}
