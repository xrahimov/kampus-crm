/**
 * Takes the screenshots the in-app manuals show (public/help/<locale>/*.jpg)
 * from a running Kampus with the demo seed. Fake data only: run it against a
 * local database that was seeded with `npm run db:seed`, never against a
 * live centre.
 *
 *   TELEGRAM_LOGIN_FAKE=1 npm start   # or npm run dev, on APP_URL (default http://localhost:3000)
 *   npx tsx scripts/help-screenshots.ts [uz ru en] [--only=name,name]
 *
 * Every shot is 1280×800 (or the element's own size) and saved as JPEG so the
 * set stays small enough to ship with the app. A shot that fails is reported
 * and skipped; the rest are still written.
 *
 * Before the first shot the script adds the demo rows the newer pages need (a
 * PDF under a group's materials, a homework with an answer, a post, a chat
 * line, a group that sells lesson packages, two siblings) and gives the demo
 * centre made-up Telegram login keys; re-runs find them and move on. With
 * TELEGRAM_LOGIN_FAKE=1 on the server the sign-in page is pictured the way a
 * live centre has it, with Telegram only; without it the password form shows.
 * The video-lesson shots run a real call between two browsers on this machine
 * with a drawn picture in place of each camera.
 */
import "dotenv/config";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
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
type Base = {
  locale: string;
  browser: Browser;
  teacherGroupId: string;
  studentToken: string;
  /** The group that sells lesson packages, and the two siblings' family page. */
  packageGroupId: string | null;
  familyToken: string | null;
};
type Ctx = Base & { page: Page };

/** The words of the demo rows the script adds. One language: the demo centre teaches English. */
const DEMO = {
  material: "Unit 3 slides",
  homework:
    "Workbook p. 24, exercises 1-4. Then write five sentences about your day in the Present Simple and send them here.",
  answer:
    "I get up at seven. I have breakfast with my family. My sister goes to school by bus. We have English on Tuesday and Thursday. In the evening I read a book.",
  post: "This week we start Unit 3: daily routines. Bring your workbook on Thursday; the slides are under Materials.",
  comment: "Will there be a test on Saturday?",
  chatTeacher: "Hello everyone! Thursday's homework is open. Write here if something is unclear.",
  chatStudent: "Thank you! Is exercise 4 for Thursday too?",
  packageGroup: "Speaking Club",
  callChat: "Open page 12, please",
  callReply: "Done!",
  poll: { question: "Ready for the test?", options: ["Yes", "Not yet"] },
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

/** A card that may be taller than a screen: its top `maxHeight` pixels, wherever it sits on the page. */
async function shotCard(el: Locator, locale: string, name: string, maxHeight = 600) {
  await el.waitFor({ state: "visible" });
  const page = el.page();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
  const box = await el.boundingBox();
  if (!box) throw new Error(`${name}: nothing to picture`);
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.screenshot({
    path: out(locale, name),
    type: "jpeg",
    quality: QUALITY,
    fullPage: true,
    clip: {
      x: box.x + scroll.x,
      y: box.y + scroll.y,
      width: box.width,
      height: Math.min(box.height, maxHeight),
    },
  });
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

/** Posts once: creates the row when the list is empty, so re-runs do not pile up demo rows. */
async function ensureRow(page: Page, listPath: string, createPath: string, body: unknown) {
  const res = await page.request.get(`${BASE}/api/v1${listPath}`);
  if (res.ok()) {
    const data = (await res.json()) as { items?: unknown[] } | unknown[];
    const rows = Array.isArray(data) ? data : (data.items ?? []);
    if (rows.length > 0) return;
  }
  await mutate(page, "post", createPath, body);
}

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const csrf = (await page.context().cookies(BASE)).find((c) => c.name === "kampus_csrf")?.value;
  return csrf ? { "x-csrf-token": csrf } : {};
}

/** A write with the double-submit CSRF token the app's own fetches send; returns the answer's JSON. */
async function mutate<T = unknown>(
  page: Page,
  method: "post" | "patch" | "put",
  apiPath: string,
  body: unknown,
): Promise<T> {
  const res = await page.request[method](`${BASE}/api/v1${apiPath}`, {
    data: body,
    headers: await csrfHeaders(page),
  });
  if (!res.ok()) throw new Error(`${method.toUpperCase()} ${apiPath} failed: ${res.status()}`);
  return (await res.json().catch(() => null)) as T;
}

async function getJson<T>(page: Page, apiPath: string): Promise<T> {
  const res = await page.request.get(`${BASE}/api/v1${apiPath}`);
  if (!res.ok()) throw new Error(`GET ${apiPath} failed: ${res.status()}`);
  return (await res.json()) as T;
}

/** Rows of a list answer, whether it is an array or `{ items }`. */
async function rows<T>(page: Page, apiPath: string): Promise<T[]> {
  const body = await getJson<{ items?: T[] } | T[]>(page, apiPath);
  return Array.isArray(body) ? body : (body.items ?? []);
}

/** What a student's page sends: no session, the link in the path and the page's own origin. */
async function asStudent(
  page: Page,
  token: string,
  apiPath: string,
  body: { data?: unknown; multipart?: Record<string, string> },
) {
  const res = await page.request.post(`${BASE}/api/v1/public/class/${token}${apiPath}`, {
    ...body,
    headers: { origin: BASE },
  });
  if (!res.ok()) throw new Error(`student POST ${apiPath} failed: ${res.status()}`);
}

/** Three slides as a PDF, printed by the browser: the file a teacher shows in a lesson. */
async function slidesPdf(browser: Browser): Promise<Buffer> {
  const slide = (title: string, body: string) =>
    `<section><p class="unit">General English · A1 · Unit 3</p><h1>${title}</h1>${body}</section>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page { size: 1280px 720px; margin: 0 }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #17203d }
    section { box-sizing: border-box; width: 1280px; height: 720px; padding: 64px 88px; page-break-after: always;
      background: #f7f5ef; border-left: 28px solid #1d2a5c }
    .unit { margin: 0 0 12px; font-size: 22px; color: #0f8a83; letter-spacing: 0.02em }
    h1 { margin: 0 0 36px; font-size: 60px }
    p, li, td, th { font-size: 32px; line-height: 1.5 }
    table { border-collapse: collapse } td, th { border: 2px solid #c9cfdf; padding: 12px 28px; text-align: left }
    th { background: #e6eaf5 } b { color: #b4530f }
  </style>
  ${slide("Daily routines", "<p>What do you do every day?</p><ul><li>get up · have breakfast · go to work</li><li>have lunch · come home · go to bed</li></ul><p>Today: the <b>Present Simple</b></p>")}
  ${slide("Present Simple", "<table><tr><th>I / You / We / They</th><th>He / She / It</th></tr><tr><td>I <b>get</b> up at seven.</td><td>She <b>gets</b> up at seven.</td></tr><tr><td>We <b>have</b> lunch at one.</td><td>He <b>has</b> lunch at one.</td></tr><tr><td>They <b>go</b> to bed late.</td><td>It <b>goes</b> to bed late.</td></tr></table>")}
  ${slide("Your turn", "<ol><li>My brother ____ (get) up at six.</li><li>We ____ (have) English on Tuesday.</li><li>She ____ (go) to school by bus.</li><li>I ____ (read) a book in the evening.</li></ol>")}`;
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ width: "1280px", height: "720px", printBackground: true });
  await page.close();
  return pdf;
}

/** Uploads a document the way the materials and homework forms do; returns its stored URL. */
async function upload(page: Page, name: string, mimeType: string, buffer: Buffer): Promise<string> {
  const res = await page.request.post(`${BASE}/api/v1/uploads/documents`, {
    multipart: { file: { name, mimeType, buffer } },
    headers: await csrfHeaders(page),
  });
  if (!res.ok()) throw new Error(`upload of ${name} failed: ${res.status()}`);
  return ((await res.json()) as { url: string }).url;
}

/**
 * The demo rows the newer pages need, made once. `teacher` teaches the group
 * the shots use; `ceo` may do the rest. Each step looks before it writes, so a
 * re-run adds nothing.
 */
async function prepare(ceo: Page, teacher: Page, base: Base): Promise<void> {
  const g = base.teacherGroupId;
  const today = tashkentToday();

  // Made-up Telegram login keys: the sign-in pages then offer "Log in with Telegram".
  const telegram = await getJson<{ isEnabled: boolean; config: Record<string, unknown> }>(
    ceo,
    "/integrations/telegram",
  );
  if (!telegram.isEnabled || !telegram.config.loginClientId) {
    await mutate(ceo, "put", "/integrations/telegram", {
      isEnabled: true,
      botToken: "",
      botUsername: "kampus_demo_bot",
      webhookSecret: "",
      weeklyReport: true,
      lessonSummary: false,
      loginClientId: "123456",
      loginClientSecret: "demo-secret",
    });
  }

  // A PDF under the group's materials: the file the teacher shows in the video lesson.
  const materials = await rows<{ title: string }>(teacher, `/groups/${g}/materials`);
  if (!materials.some((m) => m.title === DEMO.material)) {
    const url = await upload(
      teacher,
      `${DEMO.material}.pdf`,
      "application/pdf",
      await slidesPdf(base.browser),
    );
    await mutate(teacher, "post", `/groups/${g}/materials`, {
      kind: "FILE",
      title: DEMO.material,
      url,
      lessonId: null,
    });
  }

  // Homework on the lesson last taught, with one student's answer waiting to be checked.
  const homework = await getJson<{
    items: unknown[];
    lessons: Array<{ id: string; date: string }>;
    today: string;
  }>(teacher, `/groups/${g}/homework`);
  if (homework.items.length === 0) {
    const lesson = homework.lessons
      .filter((l) => l.date <= homework.today)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lesson) {
      await mutate(teacher, "put", `/lessons/${lesson.id}/homework`, { text: DEMO.homework });
      const mine = await getJson<Array<{ id: string }>>(
        teacher,
        `/public/class/${base.studentToken}/homework`,
      );
      if (mine[0]) {
        await asStudent(teacher, base.studentToken, `/homework/${mine[0].id}`, {
          multipart: { note: DEMO.answer },
        });
      }
    }
  }

  // A post in the class stream with a student's comment, and two lines of group chat.
  const posts = await rows<{ id: string }>(teacher, `/groups/${g}/stream`);
  if (posts.length === 0) {
    const post = await mutate<{ id: string }>(teacher, "post", `/groups/${g}/stream`, {
      body: DEMO.post,
      pinned: true,
    });
    await asStudent(teacher, base.studentToken, `/stream/${post.id}/comments`, {
      data: { body: DEMO.comment },
    });
  }
  const chat = await getJson<{ messages: unknown[] }>(teacher, `/groups/${g}/chat`);
  if (chat.messages.length === 0) {
    await mutate(teacher, "post", `/groups/${g}/chat`, { text: DEMO.chatTeacher });
    await asStudent(teacher, base.studentToken, "/chat", { data: { text: DEMO.chatStudent } });
  }

  // A group that sells lesson packages, with one package sold.
  const groups = await rows<{ id: string; name: string }>(ceo, "/groups?pageSize=100");
  let packageGroupId = groups.find((x) => x.name === DEMO.packageGroup)?.id ?? null;
  const students = await rows<{ id: string }>(ceo, "/students?pageSize=5");
  if (!packageGroupId) {
    const like = await getJson<{ branchId: string; courseId: string }>(ceo, `/groups/${g}`);
    const created = await mutate<{ id: string }>(ceo, "post", "/groups", {
      branchId: like.branchId,
      name: DEMO.packageGroup,
      courseId: like.courseId,
      billingMode: "PACKAGES",
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({ weekday, startTime: "16:00", endTime: "17:00" })),
      startDate: `${today.slice(0, 8)}01`,
      ignoreClashes: true,
    });
    packageGroupId = created.id;
    for (const student of students.slice(0, 2)) {
      await mutate(ceo, "post", `/groups/${packageGroupId}/members`, {
        studentId: student.id,
        joinedAt: `${today.slice(0, 8)}01`,
      });
    }
    const eight = await mutate<{ id: string }>(ceo, "post", `/groups/${packageGroupId}/packages`, {
      name: "8 lessons",
      lessons: 8,
      price: 480000,
    });
    await mutate(ceo, "post", `/groups/${packageGroupId}/packages`, {
      name: "12 lessons",
      lessons: 12,
      price: 660000,
      sortOrder: 1,
    });
    const sold = await getJson<{ credits: Array<{ membershipId: string }> }>(
      ceo,
      `/groups/${packageGroupId}/packages`,
    );
    const methods = await rows<{ id: string }>(ceo, "/payment-methods");
    if (sold.credits[0] && methods[0]) {
      await mutate(ceo, "post", `/groups/${packageGroupId}/packages/sell`, {
        membershipId: sold.credits[0].membershipId,
        packageId: eight.id,
        paymentMethodId: methods[0].id,
        paidAt: today,
      });
    }
  }
  base.packageGroupId = packageGroupId;

  // Two siblings, so there is a parents' page to show.
  if (students.length >= 2) {
    const first = students[0]!.id;
    let family = await getJson<{ url: string } | null>(ceo, `/students/${first}/family/page`);
    if (!family) {
      await mutate(ceo, "post", `/students/${first}/family/link`, { studentId: students[1]!.id });
      family = await getJson<{ url: string } | null>(ceo, `/students/${first}/family/page`);
    }
    base.familyToken = family?.url.split("/").pop() ?? null;
  }
}

/** Today's date in Tashkent (UTC+5), as the app counts days. */
function tashkentToday(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The first day from tomorrow on which the signed-in teacher has lessons, for the Today page. */
async function nextLessonDay(page: Page, locale: string): Promise<string> {
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    await go(page, locale, `/today?date=${iso}`);
    if ((await page.getByTestId("today-empty").count()) === 0) return iso;
  }
  throw new Error("the teacher has no lessons in the coming week");
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
      // A student of a monthly group who owes something, so the dialog has a balance to show.
      const rows = page.getByTestId("student-row");
      const debtor = rows.filter({ hasText: "Demo Student One" });
      await ((await debtor.count()) > 0 ? debtor : rows).first().getByRole("link").first().click();
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
  {
    name: "setup-checklist",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await shotElement(page.getByTestId("setup-checklist"), locale, "setup-checklist");
    },
  },
  {
    name: "forecast",
    take: async ({ page, locale }) => {
      await go(page, locale, "/dashboard");
      await page.getByTestId("show-numbers").click();
      await page.waitForTimeout(300);
      await shotElement(page.getByTestId("dashboard-forecast"), locale, "forecast");
    },
  },
  {
    name: "calls-today",
    take: async ({ page, locale }) => {
      // The page lists leads whose next contact is due: put one on today's list.
      const board = await (await page.request.get(`${BASE}/api/v1/leads`)).json();
      const leadId = (board as { columns: Array<{ leads: Array<{ id: string }> }> }).columns
        .flatMap((c) => c.leads)
        .find(Boolean)?.id;
      if (!leadId) throw new Error("no lead in the seed");
      await mutate(page, "patch", `/leads/${leadId}`, { nextContactAt: tashkentToday() });
      await go(page, locale, "/leads/calls");
      await page.getByTestId("call-row").first().waitFor();
      await shotPage(page, locale, "calls-today");
    },
  },
  {
    name: "trial-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/leads");
      const card = page.getByTestId("lead-card").first();
      await card.locator('button[aria-haspopup="menu"]').click();
      await page.getByTestId("lead-book-trial").click();
      await page.getByRole("dialog").waitFor();
      await shotPage(page, locale, "trial-form");
    },
  },
  {
    name: "waitlist",
    take: async ({ page, locale }) => {
      const branchId = await firstId(page, "/branches");
      const courseId = await firstId(page, "/courses?pageSize=1");
      if (!branchId || !courseId) throw new Error("no branch or course in the seed");
      await ensureRow(page, "/waitlist?status=WAITING", "/waitlist", {
        branchId,
        courseId,
        fullName: "Demo Waiting Student",
        phone: "+998901112233",
        days: "EVEN",
        lessonTime: "18:00",
        note: "Wants an evening group",
      });
      await go(page, locale, "/leads/waitlist");
      await shotPage(page, locale, "waitlist");
    },
  },
  {
    name: "timetable",
    take: async ({ page, locale }) => {
      // The first room alphabetically may be empty: show the first one with lessons.
      const res = await page.request.get(`${BASE}/api/v1/rooms`);
      const rooms = (await res.json()) as { items?: Array<{ id: string }> } | Array<{ id: string }>;
      const ids = (Array.isArray(rooms) ? rooms : (rooms.items ?? [])).map((r) => r.id);
      for (const id of ids) {
        await go(page, locale, `/timetable?id=${id}`);
        if ((await page.getByTestId("timetable-block").count()) > 0) break;
      }
      await page.getByTestId("timetable-block").first().waitFor();
      await shotPage(page, locale, "timetable");
    },
  },
  {
    name: "students-bulk",
    take: async ({ page, locale }) => {
      await go(page, locale, "/students");
      await page.getByTestId("student-row").nth(0).getByRole("checkbox").check();
      await page.getByTestId("student-row").nth(1).getByRole("checkbox").check();
      await page.getByTestId("students-bulk").waitFor();
      await shotPage(page, locale, "students-bulk");
    },
  },
  {
    name: "students-import",
    take: async ({ page, locale }) => {
      await go(page, locale, "/students");
      await page.getByTestId("students-import-menu").click();
      await page.getByTestId("students-import-balances").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: out(locale, "students-import"),
        type: "jpeg",
        quality: QUALITY,
        clip: { x: 0, y: 0, width: 1280, height: 520 },
      });
    },
  },
  {
    name: "debtors",
    take: async ({ page, locale }) => {
      await go(page, locale, "/debts");
      await shotPage(page, locale, "debtors");
    },
  },
  {
    name: "cashdesk",
    take: async ({ page, locale }) => {
      // One closed day, so the table is not empty.
      const branchId = await firstId(page, "/branches");
      if (!branchId) throw new Error("no branch in the seed");
      const today = tashkentToday();
      const [year, month] = today.split("-").map(Number);
      await ensureRow(page, `/cashdesk?year=${year}&month=${month}`, "/cashdesk", {
        branchId,
        date: today,
        countedCash: 450000,
        note: "",
      });
      await go(page, locale, "/cashdesk");
      await page.getByTestId("cash-close-row").first().waitFor();
      await shotPage(page, locale, "cashdesk");
    },
  },
  {
    name: "announcements",
    take: async ({ page, locale }) => {
      await ensureRow(page, "/announcements?pageSize=1", "/announcements", {
        audience: "CENTRE",
        title: "Holiday on Friday",
        body: "There are no lessons this Friday. Missed lessons move to Saturday at the usual time.",
        sendSms: false,
      });
      await go(page, locale, "/announcements");
      await shotPage(page, locale, "announcements");
    },
  },
  {
    name: "announcement-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/announcements");
      await page.getByTestId("announcements-new").click();
      await page.getByRole("dialog").waitFor();
      await shotPage(page, locale, "announcement-form");
    },
  },
  {
    name: "assistant",
    take: async ({ page, locale }) => {
      await go(page, locale, "/assistant");
      // The last suggestion asks for a draft SMS, which test mode answers in words.
      await page.getByTestId("assistant-suggestion").last().click();
      await page.getByTestId("assistant-message").nth(1).waitFor();
      await shotPage(page, locale, "assistant");
    },
  },
  {
    name: "soff-import",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/migration");
      await page.getByTestId("soff-import-button").waitFor();
      await shotPage(page, locale, "soff-import");
    },
  },
  {
    name: "organizations",
    take: async ({ page, locale }) => {
      await go(page, locale, "/settings/organizations");
      await page.getByTestId("organization-row").first().waitFor();
      await shotPage(page, locale, "organizations");
    },
  },
  {
    name: "account",
    take: async ({ page, locale }) => {
      await go(page, locale, "/account");
      await page.getByTestId("account-title").waitFor();
      await shotPage(page, locale, "account");
    },
  },
  {
    name: "group-packages",
    take: async ({ page, locale, packageGroupId }) => {
      if (!packageGroupId) throw new Error("no group that sells lesson packages");
      await go(page, locale, `/groups/${packageGroupId}?tab=packages`);
      await page.getByTestId("tab-packages").waitFor();
      await shotPage(page, locale, "group-packages");
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
  {
    name: "today",
    take: async ({ page, locale }) => {
      await nextLessonDay(page, locale);
      await shotPage(page, locale, "today");
    },
  },
  {
    name: "today-scan",
    take: async ({ page, locale }) => {
      await go(page, locale, "/today/scan");
      await page.getByTestId("scan-start").waitFor();
      await shotPage(page, locale, "today-scan");
    },
  },
  {
    name: "my-salary",
    take: async ({ page, locale }) => {
      await go(page, locale, "/account/salary");
      await page.getByTestId("salary-month").waitFor();
      await shotPage(page, locale, "my-salary");
    },
  },
  {
    name: "checking",
    take: async ({ page, locale }) => {
      await go(page, locale, "/checking");
      await page.getByTestId("checking-item").first().waitFor();
      await shotPage(page, locale, "checking");
    },
  },
  {
    name: "stream",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}?tab=stream`);
      await scrollTo(page.getByTestId("tab-stream"));
      await shotPage(page, locale, "stream");
    },
  },
  {
    name: "group-chat",
    take: async ({ page, locale, teacherGroupId }) => {
      await go(page, locale, `/groups/${teacherGroupId}?tab=chat`);
      await scrollTo(page.getByTestId("tab-chat"));
      await shotPage(page, locale, "group-chat");
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
  ...(
    [
      ["portal-lessons", null],
      ["portal-homework", "homework"],
      ["portal-chat", "chat"],
      ["portal-materials", "materials"],
      ["portal-stream", "stream"],
      ["portal-tests", "tests"],
      ["portal-results", "results"],
    ] as const
  ).map(([name, tab]): Shot => ({
    name,
    take: async ({ page, locale, studentToken }) => {
      await go(page, locale, `/class/${studentToken}`);
      await page.getByTestId("class-title").waitFor();
      if (tab) await page.getByTestId(`portal-tab-${tab}`).click();
      await shotCard(page.getByTestId("portal-tabs"), locale, name);
    },
  })),
  {
    name: "portal-money",
    take: async ({ page, locale, studentToken }) => {
      await go(page, locale, `/class/${studentToken}?paid=1`);
      await page.getByTestId("class-title").waitFor();
      await shotCard(page.getByTestId("portal-tabs"), locale, "portal-money");
    },
  },
  {
    name: "student-login",
    take: async ({ page, locale }) => {
      await go(page, locale, "/student/login");
      await page.getByTestId("student-login").waitFor();
      await shotPage(page, locale, "student-login");
    },
  },
  {
    name: "family-page",
    take: async ({ page, locale, familyToken }) => {
      if (!familyToken) throw new Error("no family in the demo data");
      await go(page, locale, `/family/${familyToken}`);
      await page.getByTestId("family-portal").waitFor();
      await shotPage(page, locale, "family-page");
    },
  },
  {
    name: "web-form",
    take: async ({ page, locale }) => {
      await go(page, locale, "/forms/website");
      await shotPage(page, locale, "web-form");
    },
  },
];

/* ----- the video lesson: a real call between two browsers ---------------------------------- */

const CALL_SHOTS = [
  "video-room",
  "video-show-file",
  "portal-video-phone",
  "video-whiteboard",
  "video-poll",
] as const;

/** A drawn portrait as a one-frame MJPEG file: what Chromium's fake camera plays instead of its test pattern. */
async function cameraFile(browser: Browser, dir: string, who: "teacher" | "student") {
  const [back, wall, figure] =
    who === "teacher" ? ["#24336b", "#31427f", "#e4e9fa"] : ["#0f8a83", "#17a39a", "#e6f7f4"];
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <rect width="640" height="480" fill="${back}"/>
    <rect x="0" y="0" width="640" height="300" fill="${wall}"/>
    <rect x="430" y="60" width="150" height="110" rx="6" fill="${back}" opacity="0.55"/>
    <circle cx="320" cy="178" r="62" fill="${figure}"/>
    <path d="M176 420c0-98 64-150 144-150s144 52 144 150z" fill="${figure}"/>
  </svg></body>`);
  const jpeg = await page.screenshot({ type: "jpeg", quality: 90 });
  await page.close();
  const file = path.join(dir, `${who}.mjpeg`);
  writeFileSync(file, jpeg);
  return file;
}

/** A browser with a camera and microphone that need no permission prompt and no real device. */
function launchForCall(camera: string): Promise<Browser> {
  return chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
      `--use-file-for-fake-video-capture=${camera}`,
    ],
  });
}

/** On a phone a side panel fills the screen; its own close button brings the room back. */
async function closePhonePanel(page: Page) {
  await page.locator("aside button").first().click();
}

/** One pen stroke through `points`, given as fractions of the box. */
async function stroke(page: Page, el: Locator, points: Array<[number, number]>) {
  const box = await el.boundingBox();
  if (!box) throw new Error("nothing to draw on");
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
  const [x0, y0] = at(points[0]!);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const [x, y] = at(point);
    await page.mouse.move(x, y, { steps: 6 });
  }
  await page.mouse.up();
}

/**
 * The teacher starts the group's video lesson, a student joins from a phone,
 * and the room is pictured as the lesson goes: chat and a raised hand, a file
 * shown to everyone, the whiteboard, a poll. The call is ended afterwards.
 */
async function callShots(base: Base, failures: string[]) {
  if (only && !CALL_SHOTS.some((name) => only.includes(name))) return;
  const { locale } = base;
  const dir = mkdtempSync(path.join(os.tmpdir(), "kampus-help-"));
  const teacherBrowser = await launchForCall(await cameraFile(base.browser, dir, "teacher"));
  const studentBrowser = await launchForCall(await cameraFile(base.browser, dir, "student"));
  const step = async (name: (typeof CALL_SHOTS)[number], take: () => Promise<void>) => {
    try {
      await take();
      if (!only || only.includes(name)) process.stdout.write(`  ${locale}/${name}\n`);
    } catch (error) {
      failures.push(`${locale}/${name}: ${(error as Error).message.split("\n")[0]}`);
    }
  };
  const wanted = (name: (typeof CALL_SHOTS)[number]) => !only || only.includes(name);
  try {
    const media = { permissions: ["camera", "microphone"] };
    const [, teacher] = await newPage(teacherBrowser, media);
    teacher.setDefaultTimeout(30_000);
    await signIn(teacher, locale, TEACHER);
    await go(teacher, locale, `/groups/${base.teacherGroupId}`);
    const card = teacher.getByTestId("group-video");
    const start = card.getByTestId("video-start");
    await start.or(card.getByTestId("video-join")).first().waitFor();
    // A call left open by an earlier run is joined instead of started.
    await ((await start.isVisible()) ? start : card.getByTestId("video-join")).click();
    await teacher.getByTestId("join-call").click();
    await teacher.getByTestId("call-room").waitFor();

    const [, student] = await newPage(studentBrowser, {
      ...media,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    student.setDefaultTimeout(30_000);
    await go(student, locale, `/class/${base.studentToken}`);
    await student.getByTestId("join-call").click();
    await student.getByTestId("call-room").waitFor();
    await teacher.getByTestId("tile-peer").first().waitFor();
    // The pictures need a moment to arrive on both sides.
    await teacher.waitForTimeout(4000);

    await step("video-room", async () => {
      await student.getByTestId("toggle-hand").click();
      await teacher.getByTestId("toggle-chat").click();
      await teacher.getByTestId("chat-input").fill(DEMO.callChat);
      await teacher.getByTestId("chat-send").click();
      await student.getByTestId("toggle-chat").click();
      await student.getByTestId("chat-input").fill(DEMO.callReply);
      await student.getByTestId("chat-input").press("Enter");
      await closePhonePanel(student);
      await teacher.getByTestId("chat-message").nth(1).waitFor();
      await teacher.getByTestId("hand-mark").first().waitFor();
      if (wanted("video-room")) await shotPage(teacher, locale, "video-room");
      await teacher.getByTestId("toggle-chat").click();
      await student.getByTestId("toggle-hand").click();
    });

    await step("video-show-file", async () => {
      await teacher.getByTestId("toggle-lesson").click();
      const panel = teacher.getByTestId("lesson-panel");
      await panel
        .getByTestId("lesson-material")
        .filter({ hasText: DEMO.material })
        .first()
        .getByTestId("lesson-material-show")
        .click();
      const stage = teacher.getByTestId("material-stage");
      await stage.getByTestId("material-pdf-page").waitFor();
      await stage.getByTestId("material-next").click();
      await teacher.waitForTimeout(1500);
      await stage.getByTestId("material-pen").click();
      const sheet = stage.getByTestId("material-page-box");
      // Underline the three verbs that take an "s".
      for (const [from, to, y] of [
        [0.455, 0.515, 0.49],
        [0.445, 0.495, 0.595],
        [0.425, 0.495, 0.7],
      ] as const) {
        await stroke(teacher, sheet, [
          [from, y],
          [(from + to) / 2, y + 0.004],
          [to, y],
        ]);
      }
      await teacher.waitForTimeout(800);
      if (wanted("video-show-file")) await shotPage(teacher, locale, "video-show-file");
    });

    await step("portal-video-phone", async () => {
      await student.getByTestId("material-stage").getByTestId("material-pdf-page").waitFor();
      await student.waitForTimeout(1500);
      if (wanted("portal-video-phone")) await shotPage(student, locale, "portal-video-phone");
    });
    // Whatever happened above, take the file off the screens and close the panel.
    await teacher
      .getByTestId("material-stop")
      .click({ timeout: 5000 })
      .catch(() => undefined);
    if (await teacher.getByTestId("lesson-panel").isVisible()) {
      await teacher.getByTestId("toggle-lesson").click();
    }

    await step("video-whiteboard", async () => {
      await teacher.getByTestId("toggle-board").click();
      const canvas = teacher.getByTestId("board-canvas");
      await canvas.waitFor();
      // A timeline: yesterday, today, tomorrow.
      await stroke(teacher, canvas, [
        [0.12, 0.5],
        [0.5, 0.5],
        [0.88, 0.5],
      ]);
      for (const x of [0.25, 0.5, 0.75]) {
        await stroke(teacher, canvas, [
          [x, 0.42],
          [x, 0.58],
        ]);
      }
      await stroke(teacher, canvas, [
        [0.84, 0.44],
        [0.88, 0.5],
        [0.84, 0.56],
      ]);
      // Two hops along it: from yesterday to today, from today to tomorrow.
      for (const x of [0.25, 0.5]) {
        await stroke(teacher, canvas, [
          [x, 0.4],
          [x + 0.06, 0.3],
          [x + 0.125, 0.27],
          [x + 0.19, 0.3],
          [x + 0.25, 0.4],
        ]);
      }
      await teacher.waitForTimeout(800);
      if (wanted("video-whiteboard")) await shotPage(teacher, locale, "video-whiteboard");
      await teacher.getByTestId("toggle-board").click();
    });

    await step("video-poll", async () => {
      await teacher.getByTestId("toggle-poll").click();
      // A call left open by an earlier run may already hold a poll.
      if (await teacher.getByTestId("poll-new").isVisible()) {
        await teacher.getByTestId("poll-new").click();
      }
      await teacher.getByTestId("poll-question-input").fill(DEMO.poll.question);
      const inputs = teacher.getByTestId("poll-option-input");
      await inputs.nth(0).fill(DEMO.poll.options[0]!);
      await inputs.nth(1).fill(DEMO.poll.options[1]!);
      await teacher.getByTestId("poll-open").click();
      await student.getByTestId("poll-notice").click();
      await student.getByTestId("poll-option").first().click();
      await closePhonePanel(student);
      await teacher.getByTestId("poll-question").waitFor();
      await teacher.waitForTimeout(2500);
      if (wanted("video-poll")) await shotPage(teacher, locale, "video-poll");
      await teacher.getByTestId("poll-close").click();
    });

    await teacher.getByTestId("end-call").click();
    await teacher.getByRole("alertdialog").getByRole("button").last().click();
    await teacher.getByTestId("call-done").waitFor();
  } catch (error) {
    failures.push(`${locale}/video lesson: ${(error as Error).message.split("\n")[0]}`);
  } finally {
    await teacherBrowser.close();
    await studentBrowser.close();
  }
}

/* ----- the sign-in page, the way a centre that signs in with Telegram only has it ------------ */

/** A staff session opened through the server's stand-in for Telegram (TELEGRAM_LOGIN_FAKE=1). */
async function telegramSession(
  browser: Browser,
  locale: string,
): Promise<[BrowserContext, Page] | null> {
  const [context, page] = await newPage(browser);
  try {
    await go(page, locale, "/login");
    const href = await page.getByTestId("login-telegram").getAttribute("href", { timeout: 5000 });
    const res = await page.request.get(new URL(href!, BASE).toString(), { maxRedirects: 0 });
    const auth = new URL(res.headers()["location"]!);
    const back = new URL(auth.searchParams.get("redirect_uri")!);
    back.searchParams.set("state", auth.searchParams.get("state")!);
    const claims = { id: "700000001", name: "Demo CEO", phone_number: CEO.replace("+", "") };
    back.searchParams.set(
      "code",
      `fake.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`,
    );
    await page.goto(back.toString());
    await page.waitForURL(/\/(dashboard|today|groups)/, { timeout: 15_000 });
    return [context, page];
  } catch {
    await context.close();
    return null;
  }
}

async function setTelegramOnly(page: Page, on: boolean) {
  const settings = await getJson<Record<string, unknown>>(page, "/settings/org");
  await mutate(page, "put", "/settings/org", { ...settings, staffTelegramOnly: on });
}

async function loginShot(browser: Browser, locale: string, failures: string[]) {
  if (only && !only.includes("login")) return;
  // Only a Telegram session may switch passwords off, and the same one switches them back on.
  const session = await telegramSession(browser, locale);
  if (!session) {
    process.stdout.write(
      "  (no stand-in for Telegram on the server: the sign-in page keeps its password form)\n",
    );
  }
  const [anon, anonPage] = await newPage(browser);
  try {
    if (session) await setTelegramOnly(session[1], true);
    await go(anonPage, locale, "/login");
    await shotPage(anonPage, locale, "login");
    process.stdout.write(`  ${locale}/login\n`);
  } catch (error) {
    failures.push(`${locale}/login: ${(error as Error).message.split("\n")[0]}`);
  } finally {
    if (session) {
      await setTelegramOnly(session[1], false).catch((error: Error) =>
        failures.push(`${locale}/login: passwords were not switched back on: ${error.message}`),
      );
      await session[0].close();
    }
    await anon.close();
  }
}

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

async function newPage(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    ...options,
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
    const base: Base = {
      locale,
      browser,
      teacherGroupId,
      studentToken,
      packageGroupId: null,
      familyToken: null,
    };

    const [ceoCtx, ceoPage] = await newPage(browser);
    await signIn(ceoPage, locale, CEO);
    try {
      await prepare(ceoPage, teacherPage, base);
    } catch (error) {
      failures.push(`${locale}/demo rows: ${(error as Error).message.split("\n")[0]}`);
    }

    // The call first: the group page then shows its last video lesson.
    await callShots(base, failures);

    await run(TEACHER_SHOTS, { ...base, page: teacherPage }, failures);
    await teacherCtx.close();

    await run(CEO_SHOTS, { ...base, page: ceoPage }, failures);
    await ceoCtx.close();

    const [studentCtx, studentPage] = await newPage(browser);
    await run(STUDENT_SHOTS, { ...base, page: studentPage }, failures);
    await studentCtx.close();

    // Last, so that the password sessions above are over when passwords go off for a moment.
    await loginShot(browser, locale, failures);
  }

  await browser.close();
  if (failures.length > 0) {
    process.stdout.write(`\nSkipped:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

void main();
