/**
 * Records the how-to videos: one short video per feature, in English, Russian
 * and Uzbek, from a running Kampus with the demo seed. Fake data only: run it
 * against a local database that was seeded with `npm run db:seed`, never
 * against a live centre.
 *
 *   TELEGRAM_LOGIN_FAKE=1 npm start
 *   npx tsx scripts/tutorial-videos/index.ts [en ru uz] [--only=sign-in,groups] [--out=dir] [--voice]
 *
 * Every video is 1920×1080: the page on top, the step's caption on a band
 * under it, and a `.srt` file with the same captions next to it. The scenes
 * (what is done on screen) are in `scenes.ts`, the captions of each language
 * in `words/`. A video that fails is reported and skipped; the rest are still
 * written. Needs ffmpeg with libx264 (on the PATH, or named in FFMPEG_PATH).
 *
 * With `--voice` every caption is also read aloud by an Azure voice (see
 * `voice.ts` for the key), and a step lasts as long as its sentence takes to
 * say. The recordings are kept in `<out>/voice/`; `--voice-only` fetches them
 * and records nothing.
 */
import "dotenv/config";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

import { prepare, type Base } from "../help-screenshots";

import { dress } from "./dress";
import { Film, launch, open } from "./film";
import { SCENES } from "./scenes";
import { BASE, CEO, PASSWORD, TEACHER, type Shoot } from "./shoot";
import { Voice } from "./voice";
import { WORDS, type Locale } from "./words";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = flag("only")?.split(",") ?? null;
const OUT = path.resolve(flag("out") ?? "tutorial-videos");
const VOICE_ONLY = argv.includes("--voice-only");
const VOICED = VOICE_ONLY || argv.includes("--voice");
const chosen = argv.filter((a): a is Locale => ["en", "ru", "uz"].includes(a));
const LOCALES: Locale[] = chosen.length > 0 ? chosen : ["en", "ru", "uz"];

type Messages = { [key: string]: string | Messages };

function labels(locale: Locale) {
  const messages = JSON.parse(
    readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
  ) as Messages;
  return (key: string, values: Record<string, string> = {}): string => {
    let node: string | Messages | undefined = messages;
    for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
    if (typeof node !== "string") throw new Error(`no label "${key}" in messages/${locale}.json`);
    return node.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
  };
}

async function signInOn(
  page: Page,
  locale: Locale,
  label: Shoot["label"],
  phone: string,
  password: string,
) {
  await page.goto(`${BASE}/${locale}/login`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByLabel(label("auth.phone")).fill(phone);
  await page.getByLabel(label("auth.password"), { exact: true }).fill(password);
  await page.getByRole("button", { name: label("auth.signIn"), exact: true }).click();
  await page.waitForURL(/\/(dashboard|today|groups|set-password)/);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

/** The daily summary opens by itself once a day; in a lesson it would cover the page. */
async function quiet(page: Page) {
  await page.context().addInitScript(() => {
    try {
      localStorage.setItem("kampus.summary.auto", "off");
    } catch {
      // A page without storage is filmed as it is.
    }
  });
}

async function main() {
  const failures: string[] = [];
  const scenes = SCENES.filter((s) => !only || only.includes(s.id));
  for (const locale of LOCALES) {
    const label = labels(locale);
    const words = WORDS[locale];
    /** The caption of a step with the app's own labels put in. */
    const caption = (id: (typeof scenes)[number]["id"], step: string): string => {
      const text = (words.videos[id].steps as Record<string, string>)[step];
      if (!text) throw new Error(`no caption "${step}" for ${id} in ${locale}`);
      return text.replace(/\{([\w.]+)\}/g, (_, key: string) => label(key));
    };
    const voice = VOICED ? new Voice(locale, path.join(OUT, "voice", locale)) : null;
    if (voice) {
      // Every sentence is fetched before the camera runs, so no video waits for the network.
      const made = await voice.ensure(
        scenes.flatMap((scene) =>
          Object.keys(words.videos[scene.id].steps).map((step) => caption(scene.id, step)),
        ),
      );
      process.stdout.write(`  ${locale}: voice ready (${made} new sentences)\n`);
    }
    if (VOICE_ONLY) continue;

    // Backstage: the CEO's session for the API, and the demo rows the pages need.
    const backstage = await launch();
    const [, ceo] = await open(backstage);
    await quiet(ceo);
    await signInOn(ceo, locale, label, CEO, PASSWORD);
    const [teacherContext, teacher] = await open(backstage);
    await signInOn(teacher, locale, label, TEACHER, PASSWORD);
    const groups = (await (
      await teacher.request.get(`${BASE}/api/v1/groups?pageSize=1`)
    ).json()) as {
      items: Array<{ id: string }>;
    };
    const teacherGroupId = groups.items[0]!.id;
    const links = (await (
      await teacher.request.get(`${BASE}/api/v1/groups/${teacherGroupId}/video/links`)
    ).json()) as Array<{ token: string }>;
    const base: Base = {
      locale,
      browser: backstage,
      teacherGroupId,
      studentToken: links[0]!.token,
      packageGroupId: null,
      familyToken: null,
    };
    await prepare(ceo, teacher, base);
    await dress(ceo, locale);
    await teacherContext.close();

    for (const scene of scenes) {
      const number = String(SCENES.indexOf(scene) + 1).padStart(2, "0");
      const text = words.videos[scene.id];
      const name = `${number}-${scene.id}`;
      const browser = await launch();
      const film = new Film(mkdtempSync(path.join(os.tmpdir(), "kampus-film-")));
      // The step being filmed, named when a scene stops.
      let at = "start";
      try {
        const [, page] = await open(browser);
        await quiet(page);
        const shoot: Shoot = {
          locale,
          film,
          browser,
          page,
          ceo,
          base,
          label,
          url: (pathname) => `${BASE}/${locale}${pathname}`,
          say: (step, work, extra) => {
            at = step;
            const sentence = caption(scene.id, step);
            return film.step(sentence, work, extra, voice?.get(sentence));
          },
          go: (pathname, target = page) =>
            film.offCamera(async () => {
              await target.goto(`${BASE}/${locale}${pathname}`);
              await target.waitForLoadState("networkidle").catch(() => undefined);
              await target.waitForTimeout(500);
            }),
          signIn: (phone, target = page, password = PASSWORD) =>
            film.offCamera(() => signInOn(target, locale, label, phone, password)),
        };
        await film.watch(page);
        await film.title({
          index: `${words.series} · ${number}`,
          title: text.title,
          note: text.note,
        });
        await scene.run(shoot);
        await film.wait(0.8);
        const seconds = await film.finish(path.join(OUT, locale, name));
        process.stdout.write(`  ${locale}/${name}.mp4  ${Math.round(seconds)} s\n`);
      } catch (error) {
        const what = `${locale}/${name} at step "${at}": ${(error as Error).message.split("\n")[0]}`;
        failures.push(what);
        process.stdout.write(`  FAILED ${what}\n`);
        // What the page looked like when the scene stopped, for whoever repairs it.
        mkdirSync(path.join(OUT, locale), { recursive: true });
        for (const [i, context] of browser.contexts().entries()) {
          await context
            .pages()[0]
            ?.screenshot({ path: path.join(OUT, locale, `${name}-failed-${i}.png`) })
            .catch(() => undefined);
        }
        await film.discard();
      } finally {
        await browser.close();
      }
    }
    await backstage.close();
  }
  if (failures.length > 0) {
    process.stdout.write(`\nSkipped:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

void main();
