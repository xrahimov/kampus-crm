/**
 * Takes the screenshots the in-app manuals show (public/help/<locale>/*.jpg)
 * from a running Kampus with the demo seed. Fake data only: run it against a
 * local database that was seeded with `npm run db:seed`, never against a
 * live centre.
 *
 *   npm run dev            # or npm start, on APP_URL (default http://localhost:3000)
 *   npx tsx scripts/help-screenshots.ts [uz ru en] [--only name,name]
 *
 * Every shot is 1280×800 (or the element's own size) and saved as JPEG so the
 * set stays small enough to ship with the app. A shot that fails is reported
 * and skipped; the rest are still written.
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const CEO = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER = "+998900000004";
const OUT = path.join(process.cwd(), "public", "help");
const QUALITY = 82;

const argv = process.argv.slice(2);
const only =
  argv
    .find((a) => a.startsWith("--only="))
    ?.slice(7)
    .split(",") ?? null;
const locales = argv.filter((a) => ["uz", "ru", "en"].includes(a));
const LOCALES = locales.length > 0 ? locales : ["uz", "ru", "en"];

// Labels that differ per language: the few buttons the script has to press by
// text rather than by test id.
const LABELS: Record<string, Record<string, string>> = {
  phone: { uz: "Telefon raqam", ru: "Номер телефона", en: "Phone number" },
  password: { uz: "Parol", ru: "Пароль", en: "Password" },
  signIn: { uz: "Kirish", ru: "Войти", en: "Sign in" },
};

type Shot = { name: string; take: (ctx: Ctx) => Promise<void> };
type Ctx = {
  page: Page;
  locale: string;
  browser: Browser;
  teacherGroupId: string;
  studentToken: string;
};

function out(locale: string, name: string) {
  return path.join(OUT, locale, `${name}.jpg`);
}

async function shotPage(
  page: Page,
  locale: string,
  name: string,
  opts: { fullPage?: boolean } = {},
) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: out(locale, name),
    type: "jpeg",
    quality: QUALITY,
    fullPage: opts.fullPage ?? false,
  });
}

async function shotElement(el: Locator, locale: string, name: string) {
  await el.waitFor({ state: "visible" });
  await el.page().waitForTimeout(400);
  await el.screenshot({ path: out(locale, name), type: "jpeg", quality: QUALITY });
}

/** Scrolls so that `el` sits just under the sticky header, for shots of a tab further down a page. */
async function scrollTo(el: Locator) {
  await el.waitFor({ state: "visible" });
  await el.evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -72);
  });
  await el.page().waitForTimeout(250);
}

async function signIn(page: Page, locale: string, phone: string) {
  await page.goto(`${BASE}/${locale}/login`);
  // The dev server hydrates a freshly compiled page a moment after it loads.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500);
  await page.getByLabel(LABELS.phone![locale]!).fill(phone);
  await page.getByLabel(LABELS.password![locale]!).fill(PASSWORD);
  await page.getByRole("button", { name: LABELS.signIn![locale]!, exact: true }).click();
  await page.waitForURL(/\/(dashboard|groups)/);
}

async function go(page: Page, locale: string, pathname: string) {
  await page.goto(`${BASE}/${locale}${pathname}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function firstId(page: Page, apiPath: string): Promise<string | null> {
  const res = await page.request.get(`${BASE}/api/v1${apiPath}`);
  if (!res.ok()) return null;
  const body = (await res.json()) as { items?: Array<{ id: string }> } | Array<{ id: string }>;
  const rows = Array.isArray(body) ? body : (body.items ?? []);
  return rows[0]?.id ?? null;
}

/** Shots taken as the CEO. */
const CEO_SHOTS: Shot[] = [
  {
    name: "dashboard",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await shotPage(page, locale, "dashboard");
    },
  },
  {
    name: "dashboard-numbers",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await page.getByTestId("show-numbers").click();
      await page.waitForTimeout(300);
      await shotElement(page.getByTestId("dashboard-kpis"), locale, "dashboard-numbers");
    },
  },
  {
    name: "dashboard-schedule",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await shotElement(page.getByTestId("schedule"), locale, "dashboard-schedule");
    },
  },
  {
    name: "search",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await page.getByTestId("global-search").fill("Demo");
      await page.getByTestId("global-search-results").waitFor();
      await page.getByTestId("search-hit").first().waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: out(locale, "search"),
        type: "jpeg",
        quality: QUALITY,
        clip: { x: 0, y: 0, width: 1280, height: 420 },
      });
    },
  },
  {
    name: "notifications",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await page.getByTestId("notification-bell").click();
      await page.getByTestId("notification-panel").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: out(locale, "notifications"),
        type: "jpeg",
        quality: QUALITY,
        clip: { x: 640, y: 0, width: 640, height: 520 },
      });
    },
  },
  {
    name: "help",
    take: async ({ page, locale }) => {
      await go(page, locale, "/help");
      await shotPage(page, locale, "help");
    },
  },
  {
    name: "leads",
    take: async ({ page, locale }) => {
      await go(page, locale, "/leads");
      await shotPage(page, locale, "leads");
    },
  },
  {
    name: "lead-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/leads");
      await page.getByTestId("add-lead").first().click();
      await page.getByTestId("lead-dialog").waitFor();
      await shotPage(page, locale, "lead-form");
    },
  },
  {
    name: "leads-to-group",
    take: async ({ page, locale }) => {
      await go(page, locale, "/leads");
      const card = page.getByTestId("lead-card").first();
      await card.getByRole("checkbox").check();
      await page.getByTestId("leads-to-group").click();
      await page.getByTestId("leads-to-group-dialog").waitFor();
      await shotPage(page, locale, "leads-to-group");
    },
  },
  {
    name: "lead-sources",
    take: async ({ page, locale }) => {
      await go(page, locale, "/leads/sources");
      await shotPage(page, locale, "lead-sources");
    },
  },
  {
    name: "groups",
    take: async ({ page, locale }) => {
      await go(page, locale, "/groups");
      await shotPage(page, locale, "groups");
    },
  },
  {
    name: "group-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/groups");
      await page.getByTestId("add-button").click();
      await page.getByTestId("group-dialog").waitFor();
      await shotPage(page, locale, "group-form");
    },
  },
  {
    name: "group-detail",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}`);
      await shotPage(page, locale, "group-detail");
    },
  },
  {
    name: "group-members",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}`);
      await page.getByTestId("member-row").first().waitFor();
      await shotElement(page.getByTestId("members-card"), locale, "group-members");
    },
  },
  {
    name: "students",
    take: async ({ page, locale }) => {
      await go(page, locale, "/students");
      await shotPage(page, locale, "students");
    },
  },
  {
    name: "student-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/students");
      await page.getByTestId("add-button").click();
      await page.getByTestId("student-dialog").waitFor();
      await shotPage(page, locale, "student-form");
    },
  },
  {
    name: "student-profile",
    take: async ({ page, locale }) => {
      await go(page, locale, "/students");
      await page.getByTestId("student-row").first().getByRole("link").first().click();
      await page.getByTestId("student-title").waitFor();
      await shotPage(page, locale, "student-profile");
    },
  },
  {
    name: "payment-dialog",
    take: async ({ page, locale }) => {
      await go(page, locale, "/students");
      await page.getByTestId("student-row").first().getByRole("link").first().click();
      await page.getByTestId("pay-student").click();
      await page.getByTestId("payment-info").waitFor();
      await shotPage(page, locale, "payment-dialog");
    },
  },
  {
    name: "receipt",
    take: async ({ page, locale }) => {
      const id = await firstId(page, "/payments?pageSize=1");
      if (!id) throw new Error("no payment in the seed");
      await go(page, locale, `/payments/${id}/receipt`);
      await page.getByTestId("receipt").waitFor();
      await shotElement(page.getByTestId("receipt"), locale, "receipt");
    },
  },
  {
    name: "payments-log",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/payments");
      await shotPage(page, locale, "payments-log");
    },
  },
  {
    name: "exams",
    take: async ({ page, locale }) => {
      await go(page, locale, "/exams");
      await shotPage(page, locale, "exams");
    },
  },
  {
    name: "exam-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/exams");
      await page.getByTestId("add-button").click();
      await page.getByRole("dialog").waitFor();
      await shotPage(page, locale, "exam-form");
    },
  },
  {
    name: "exam-results",
    take: async ({ page, locale }) => {
      const id = await firstId(page, "/exams?pageSize=1&type=GROUP");
      if (!id) throw new Error("no exam in the seed");
      await go(page, locale, `/exams/${id}`);
      await shotPage(page, locale, "exam-results");
    },
  },
  {
    name: "question-bank",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/tests?tab=bank");
      await shotPage(page, locale, "question-bank");
    },
  },
  {
    name: "tests",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/tests");
      await shotPage(page, locale, "tests");
    },
  },
  {
    name: "coin-settings",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/coins");
      await shotPage(page, locale, "coin-settings");
    },
  },
  {
    name: "coins-report",
    take: async ({ page, locale }) => {
      await go(page, locale, "/reports/coins");
      await shotPage(page, locale, "coins-report");
    },
  },
  {
    name: "finance",
    take: async ({ page, locale }) => {
      await go(page, locale, "/finance");
      await shotPage(page, locale, "finance");
    },
  },
  {
    name: "finance-category",
    take: async ({ page, locale }) => {
      const id = await firstId(page, `/finance/categories?year=${new Date().getFullYear()}`);
      if (!id) throw new Error("no finance category in the seed");
      await go(page, locale, `/finance/costs/${id}`);
      await shotPage(page, locale, "finance-category");
    },
  },
  {
    name: "payroll",
    take: async ({ page, locale }) => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      await go(page, locale, `/finance/salary-detail/${month}`);
      await shotPage(page, locale, "payroll");
    },
  },
  {
    name: "reports",
    take: async ({ page, locale }) => {
      await go(page, locale, "/reports");
      await shotPage(page, locale, "reports");
    },
  },
  {
    name: "report-payments",
    take: async ({ page, locale }) => {
      await go(page, locale, "/reports/payments");
      await shotPage(page, locale, "report-payments");
    },
  },
  {
    name: "report-churn",
    take: async ({ page, locale }) => {
      await go(page, locale, "/reports/churn");
      await shotPage(page, locale, "report-churn");
    },
  },
  {
    name: "teachers",
    take: async ({ page, locale }) => {
      await go(page, locale, "/teachers");
      await shotPage(page, locale, "teachers");
    },
  },
  {
    name: "staff-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/teachers");
      await page.getByTestId("add-button").click();
      await page.getByRole("dialog").waitFor();
      await shotPage(page, locale, "staff-form");
    },
  },
  {
    name: "roles",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/roles");
      await shotPage(page, locale, "roles");
    },
  },
  {
    name: "settings-general",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/general");
      await shotPage(page, locale, "settings-general");
    },
  },
  {
    name: "settings-courses",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/courses");
      await shotPage(page, locale, "settings-courses");
    },
  },
  {
    name: "settings-sms",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/sms");
      await shotPage(page, locale, "settings-sms");
    },
  },
  {
    name: "settings-logs",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/logs/actions");
      await shotPage(page, locale, "settings-logs");
    },
  },
  {
    name: "integrations",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/integrations");
      await shotPage(page, locale, "integrations");
    },
  },
  {
    name: "bot-recipients",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/bot");
      await shotPage(page, locale, "bot-recipients");
    },
  },
];

/** Shots taken as a teacher, on the group they teach. */
const TEACHER_SHOTS: Shot[] = [
  {
    name: "teacher-groups",
    take: async ({ page, locale }) => {
      await go(page, locale, "/groups");
      await shotPage(page, locale, "teacher-groups");
    },
  },
  {
    name: "attendance",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}?tab=attendance`);
      await shotElement(page.getByTestId("attendance-grid"), locale, "attendance");
    },
  },
  {
    name: "grades",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}?tab=grades`);
      await shotElement(page.getByTestId("grades-grid"), locale, "grades");
    },
  },
  {
    name: "homework",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}?tab=homework`);
      await scrollTo(page.getByTestId("tab-homework"));
      await shotPage(page, locale, "homework");
    },
  },
  {
    name: "materials",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}?tab=materials`);
      await scrollTo(page.getByTestId("tab-materials"));
      await shotPage(page, locale, "materials");
    },
  },
  {
    name: "video-card",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}`);
      await shotElement(page.getByTestId("group-video"), locale, "video-card");
    },
  },
  {
    name: "student-links",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}`);
      await page.getByTestId("video-links").click();
      await page.getByRole("dialog").waitFor();
      await shotPage(page, locale, "student-links");
    },
  },
];

/** Shots of a student's personal page; no sign-in. */
const STUDENT_SHOTS: Shot[] = [
  {
    name: "portal",
    take: async ({ page, locale, studentToken }) => {
      await go(page, locale, `/class/${studentToken}`);
      await page.getByTestId("class-title").waitFor();
      await shotPage(page, locale, "portal");
    },
  },
  {
    name: "portal-lesson",
    take: async ({ page, locale, studentToken }) => {
      await go(page, locale, `/class/${studentToken}`);
      await page.getByTestId("class-title").waitFor();
      await page.screenshot({
        path: out(locale, "portal-lesson"),
        type: "jpeg",
        quality: QUALITY,
        clip: { x: 0, y: 0, width: 1280, height: 520 },
      });
    },
  },
  {
    name: "portal-homework",
    take: async ({ page, locale, studentToken }) => {
      await go(page, locale, `/class/${studentToken}`);
      await page.getByTestId("portal-tab-homework").click();
      await scrollTo(page.getByTestId("portal-tab-homework"));
      await shotPage(page, locale, "portal-homework");
    },
  },
  {
    name: "portal-money",
    take: async ({ page, locale, studentToken }) => {
      await go(page, locale, `/class/${studentToken}?paid=1`);
      await page.getByTestId("class-title").waitFor();
      await scrollTo(page.getByTestId("portal-tab-homework"));
      await shotPage(page, locale, "portal-money");
    },
  },
];

async function run(shots: Shot[], ctx: Ctx, failures: string[]) {
  for (const shot of shots) {
    if (only && !only.includes(shot.name)) continue;
    try {
      await shot.take(ctx);
      process.stdout.write(`  ${ctx.locale}/${shot.name}\n`);
    } catch (error) {
      failures.push(`${ctx.locale}/${shot.name}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
}

async function newPage(browser: Browser): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  // The development build's status badge has no place in a manual.
  await context.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  // A page compiles on first visit in development, which can take a while.
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(90_000);
  return [context, page];
}

async function main() {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
  });
  const failures: string[] = [];

  for (const locale of LOCALES) {
    mkdirSync(path.join(OUT, locale), { recursive: true });

    // The login page itself, before anyone signs in.
    const [anon, anonPage] = await newPage(browser);
    if (!only || only.includes("login")) {
      try {
        await go(anonPage, locale, "/login");
        await shotPage(anonPage, locale, "login");
        process.stdout.write(`  ${locale}/login\n`);
      } catch (error) {
        failures.push(`${locale}/login: ${(error as Error).message.split("\n")[0]}`);
      }
    }
    await anon.close();

    // The teacher's group and one student's link, read through the API.
    const [teacherCtx, teacherPage] = await newPage(browser);
    await signIn(teacherPage, locale, TEACHER);
    const groupsRes = await teacherPage.request.get(`${BASE}/api/v1/groups?pageSize=1`);
    const groups = (await groupsRes.json()) as { items: Array<{ id: string }> };
    const teacherGroupId = groups.items[0]!.id;
    const linksRes = await teacherPage.request.get(
      `${BASE}/api/v1/groups/${teacherGroupId}/video/links`,
    );
    const links = (await linksRes.json()) as Array<{ token: string }>;
    const studentToken = links[0]!.token;
    const base = { locale, browser, teacherGroupId, studentToken };

    await run(TEACHER_SHOTS, { ...base, page: teacherPage }, failures);
    await teacherCtx.close();

    const [ceoCtx, ceoPage] = await newPage(browser);
    await signIn(ceoPage, locale, CEO);
    await run(CEO_SHOTS, { ...base, page: ceoPage }, failures);
    await ceoCtx.close();

    const [studentCtx, studentPage] = await newPage(browser);
    await run(STUDENT_SHOTS, { ...base, page: studentPage }, failures);
    await studentCtx.close();
  }

  await browser.close();
  if (failures.length > 0) {
    process.stdout.write(`\nSkipped:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

void main();
