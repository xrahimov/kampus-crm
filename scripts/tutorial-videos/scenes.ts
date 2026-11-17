/**
 * What is done on screen in each tutorial video. A scene only acts; what is
 * said about each step is in `words/<locale>.ts` under the same step name.
 * Demo data only: names and numbers here are made up.
 */
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import {
  askToJoin,
  cameraFile,
  asStudent,
  closePhonePanel,
  DEMO,
  getJson,
  mutate,
  rows,
  stroke,
  tashkentToday,
} from "../help-screenshots";

import { named } from "./dress";
import { DESKTOP, fit, launch, open, PHONE } from "./film";
import { BASE, CEO, TEACHER, type Scene, type Shoot } from "./shoot";

/** The made-up people of the videos. */
const CAST = {
  newTeacher: { name: "Madina Yusupova", phone: "+998905551234", password: "Samarkand-2026" },
  newAdmin: { name: "Jasur Karimov", phone: "+998907774411" },
};

/** The main menu's link to a page, by the page's label key. */
/** What the people in the videos type where a centre would write in its own language. */
const TYPED = {
  en: {
    dayOff: "Teacher at a conference",
    post: "On Saturday we write a short test on Unit 3. Revise the Present Simple.",
    chat: "Good evening! Any questions about the homework?",
    noticeTitle: "Holiday on Friday",
    notice: "There are no lessons this Friday. Missed lessons move to Saturday at the usual time.",
    question: "Who has not paid for November?",
    expense: "Markers and paper",
    earlierTitle: "New timetable from Monday",
    earlier: "From Monday the evening groups start at 18:30. Check your timetable on your page.",
  },
  ru: {
    dayOff: "Учитель на конференции",
    post: "В субботу пишем короткий тест по Unit 3. Повторите Present Simple.",
    chat: "Добрый вечер! Есть вопросы по домашнему заданию?",
    noticeTitle: "Выходной в пятницу",
    notice: "В эту пятницу уроков нет. Пропущенные уроки переносятся на субботу в обычное время.",
    question: "Кто не оплатил за ноябрь?",
    expense: "Маркеры и бумага",
    earlierTitle: "Новое расписание с понедельника",
    earlier:
      "С понедельника вечерние группы начинаются в 18:30. Проверьте расписание на своей странице.",
  },
  uz: {
    dayOff: "O‘qituvchi konferensiyada",
    post: "Shanba kuni Unit 3 bo‘yicha qisqa test yozamiz. Present Simple ni takrorlang.",
    chat: "Xayrli kech! Uy vazifasi bo‘yicha savollar bormi?",
    noticeTitle: "Juma kuni dam olish",
    notice:
      "Shu juma kuni darslar bo‘lmaydi. Qoldirilgan darslar shanbaga, odatdagi vaqtga ko‘chadi.",
    question: "Noyabr uchun kim to‘lamagan?",
    expense: "Marker va qog‘oz",
    earlierTitle: "Dushanbadan yangi jadval",
    earlier:
      "Dushanbadan kechki guruhlar 18:30 da boshlanadi. Jadvalni o‘z sahifangizda tekshiring.",
  },
} as const;

const typed = (s: Shoot) => TYPED[s.locale];

function nav(s: Shoot, key: string): Locator {
  // A menu line may carry a counter after its name ("Checking 1").
  const name = s.label(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return s.page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: new RegExp(`^${name}(\\s*\\d+)?$`) });
}

/** The button that saves the form of a dialog. */
function save(dialog: Locator): Locator {
  return dialog.locator('button[type="submit"]').last();
}

/** Opens a drop-down and chooses the option with this text (or the n-th one). */
async function choose(s: Shoot, trigger: Locator, option: string | RegExp | number) {
  await s.film.click(trigger);
  const options = s.page.getByRole("option");
  await s.film.click(
    typeof option === "number" ? options.nth(option) : options.filter({ hasText: option }).first(),
  );
}

/** A date `days` from today in Tashkent, as date fields take it. */
function day(days: number): string {
  const date = new Date(`${tashkentToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The first of next month: when a new group usually starts. */
function nextMonth(): string {
  const [year, month] = tashkentToday().split("-").map(Number);
  return month === 12 ? `${year! + 1}-01-01` : `${year}-${String(month! + 1).padStart(2, "0")}-01`;
}

/** An item of an open menu, by its label key. */
function menuItem(s: Shoot, key: string): Locator {
  return s.page
    .getByRole("menuitem")
    .filter({ hasText: s.label(key) })
    .first();
}

/** Closes whatever menu or panel is open, the way a person presses Escape. */
async function escape(s: Shoot) {
  await s.page.keyboard.press("Escape");
  await s.film.wait(0.4);
}

/** The bot hears "Share my number" from `phone`: what Telegram delivers when a person presses it. */
async function shareNumber(page: Page, phone: string, name: string) {
  const id = Number(phone.slice(-9));
  await page.request.post(`${BASE}/api/v1/webhooks/telegram?secret=${DEMO.botSecret}`, {
    data: {
      message: {
        chat: { id },
        from: { id, first_name: name, language_code: "uz" },
        contact: { phone_number: phone.slice(1), user_id: id },
      },
    },
  });
}

const signIn: Scene = {
  id: "sign-in",
  async run(s) {
    const { film, page } = s;
    const who = CAST.newTeacher;
    // Backstage: the manager has added Madina with her phone number and no password.
    await film.offCamera(async () => {
      const me = await getJson<{ branches: Array<{ id: string }> }>(s.ceo, "/auth/me");
      const added = await mutate<{ id: string }>(s.ceo, "post", "/staff", {
        fullName: who.name,
        phone: who.phone,
        gender: "FEMALE",
        roleCodes: ["TEACHER"],
        branchIds: [me.branches[0]!.id],
      }).catch(() => null);
      // She teaches a group together with the demo teacher, so her first page has lessons on it.
      if (added?.id) {
        const group = await getJson<{
          teachers: Array<{ userId: string; role: string; shareType: string; shareValue: number }>;
        }>(s.ceo, `/groups/${s.base.teacherGroupId}`);
        await mutate(s.ceo, "patch", `/groups/${s.base.teacherGroupId}`, {
          teachers: [
            ...group.teachers.map(({ userId, role, shareType, shareValue }) => ({
              userId,
              role,
              shareType,
              shareValue,
            })),
            { userId: added.id, role: "CO_TEACHER", shareType: "PER_LESSON", shareValue: 40000 },
          ],
        }).catch(() => undefined);
      }
    });
    await s.go("/login");
    const phone = page.getByLabel(s.label("auth.phone"));

    await s.say("page", async () => {
      await film.show(page.locator("form").first(), 2);
    });
    await s.say("phone", async () => {
      await film.type(phone, who.phone);
      await film.click(page.getByTestId("login-get-code"));
      await page.getByTestId("phone-code-step").waitFor();
    });
    await s.say("bot", async () => {
      await film.show(page.getByTestId("code-no-message"), 3);
      await shareNumber(page, who.phone, who.name);
    });
    await s.say("code", async () => {
      await film.type(page.getByLabel(s.label("auth.code")), who.phone.slice(-6));
      await film.click(page.getByRole("button", { name: s.label("auth.confirmCode") }));
      await page.waitForURL(/set-password/);
    });
    await s.say("password", async () => {
      const form = page.getByTestId("set-password-form");
      await film.type(form.getByLabel(s.label("auth.newPassword"), { exact: true }), who.password);
      await film.type(form.getByLabel(s.label("auth.confirmPassword")), who.password);
      await film.click(form.getByRole("button", { name: s.label("auth.savePassword") }));
      await page.waitForURL(/\/(dashboard|today)/);
    });
    await s.say(
      "inside",
      async () => {
        await page.waitForLoadState("networkidle").catch(() => undefined);
      },
      1,
    );
    await s.say("out", async () => {
      await film.click(page.getByTestId("user-menu"));
      await film.click(page.getByTestId("sign-out"));
      await page.waitForURL(/\/login/);
    });
    await s.say(
      "again",
      async () => {
        await film.type(page.getByLabel(s.label("auth.phone")), who.phone);
        await film.type(page.getByLabel(s.label("auth.password"), { exact: true }), who.password);
        await film.click(page.getByRole("button", { name: s.label("auth.signIn"), exact: true }));
        await page.waitForURL(/\/(dashboard|today)/);
        await page.waitForLoadState("networkidle").catch(() => undefined);
      },
      1,
    );
  },
};

const gettingAround: Scene = {
  id: "getting-around",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/dashboard");

    await s.say("menu", async () => {
      await film.show(page.getByRole("navigation", { name: "Main" }), 2.4);
    });
    await s.say("open", async () => {
      await film.click(nav(s, "nav.groups"));
      await page.getByTestId("group-row").first().waitFor();
      await film.wait(1.2);
      await film.click(nav(s, "nav.students"));
      await page.getByTestId("student-row").first().waitFor();
    });
    await s.say("search", async () => {
      await film.type(page.getByTestId("global-search"), "Demo");
      await page.getByTestId("search-hit").first().waitFor();
      await film.show(page.getByTestId("global-search-results"), 2);
      return async () => {
        await escape(s);
        await page.getByTestId("global-search").fill("");
      };
    });
    await s.say("branch", async () => {
      await film.click(page.getByRole("button", { name: s.label("branch.select") }));
      return () => escape(s);
    });
    await s.say("language", async () => {
      await film.click(page.getByRole("button", { name: s.label("common.language") }));
      return () => escape(s);
    });
    await s.say("bell", async () => {
      await film.click(page.getByTestId("notification-bell"));
      await page.getByTestId("notification-panel").waitFor();
      return () => escape(s);
    });
    await s.say("account", async () => {
      await film.click(page.getByTestId("user-menu"));
      await film.click(page.getByTestId("menu-account"));
      await page.getByTestId("account-title").waitFor();
    });
    await s.say("help", async () => {
      await film.click(page.getByTestId("nav-help"));
      await page.waitForURL(/\/help/);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await film.wait(1);
      await film.scroll(420);
    });
  },
};

const dashboard: Scene = {
  id: "dashboard",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/dashboard");

    await s.say("home");
    await s.say("setup", async () => {
      await film.show(page.getByTestId("setup-checklist"), 2.4);
    });
    await s.say("eye", async () => {
      await film.click(page.getByTestId("show-numbers"));
      await film.show(page.getByTestId("dashboard-kpis"), 2.2);
    });
    await s.say("forecast", async () => {
      await film.bring(page.getByTestId("dashboard-forecast"));
      await film.show(page.getByTestId("dashboard-forecast"), 2.2);
    });
    await s.say("schedule", async () => {
      await film.bring(page.getByTestId("schedule"));
      await film.show(page.getByTestId("schedule"), 2.2);
      await film.click(page.getByTestId("schedule-block").first());
      await page.getByTestId("group-title").waitFor();
    });
    await s.say("back", async () => {
      await film.click(nav(s, "nav.dashboard"));
      await page.getByTestId("dashboard-kpis").waitFor();
      // The figures hide again whenever the page is left.
      await film.click(page.getByTestId("show-numbers"));
      await film.bring(page.getByTestId("dashboard-finance"));
      await film.show(page.getByTestId("dashboard-finance"), 2);
    });
  },
};

const staff: Scene = {
  id: "staff",
  async run(s) {
    const { film, page } = s;
    const who = CAST.newAdmin;
    await s.signIn(CEO);
    await s.go("/settings/staff");

    await s.say("list", async () => {
      await film.show(page.getByTestId("staff-row").first(), 2);
    });
    const dialog = page.getByTestId("staff-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("add-button"));
      await dialog.waitFor();
      await film.type(dialog.locator("#staff-fullName"), who.name);
      await film.type(dialog.locator("#staff-phone"), who.phone);
    });
    await s.say("role", async () => {
      const role = dialog
        .locator("label")
        .filter({ hasText: s.label("roles.ADMIN") })
        .first();
      await film.click(role);
      await film.show(dialog.locator("fieldset").filter({ hasText: s.label("roles.ADMIN") }), 1.6);
    });
    await s.say("password", async () => {
      await film.show(dialog.locator("#staff-password"), 2.2);
    });
    await s.say("save", async () => {
      await film.click(save(dialog));
      await page.getByTestId("staff-row").filter({ hasText: who.name }).waitFor();
      await film.show(page.getByTestId("staff-row").filter({ hasText: who.name }), 2);
    });
    await s.say(
      "teachers",
      async () => {
        await film.click(nav(s, "nav.teachers"));
        await page.getByTestId("teacher-row").first().waitFor();
        await film.click(page.getByTestId("teacher-row").first().getByRole("link").first());
        await page.waitForLoadState("networkidle").catch(() => undefined);
      },
      1,
    );
    await s.go("/settings/roles");
    await s.say(
      "roles",
      async () => {
        await film.show(
          page
            .getByTestId("role-row")
            .filter({ hasText: s.label("roles.TEACHER") })
            .first(),
          2,
        );
      },
      1.5,
    );
  },
};

/** Two more people at the door of the centre. The second is declined before the video starts. */
const WAITING = [
  { name: "Bekzod Tursunov", phone: "+998935550101", note: "IELTS Evening" },
  { name: "Kamola Ismoilova", phone: "+998935550102", note: "" },
] as const;

const signInRequests: Scene = {
  id: "sign-in-requests",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    // Backstage: two more people asked to be let in, and one of them was declined.
    await film.offCamera(async () => {
      for (const who of WAITING) await askToJoin(s.base.browser, who).catch(() => undefined);
      const { items } = await getJson<{ items: Array<{ id: string; phone: string }> }>(
        s.ceo,
        "/join-requests",
      );
      const declined = items.find((r) => r.phone === WAITING[1].phone);
      if (declined) await mutate(s.ceo, "post", `/join-requests/${declined.id}/decline`, {});
    });
    await s.go("/student/login");

    await s.say("unknown", async () => {
      await film.show(page.getByTestId("student-login"), 2.4);
    });
    await s.go("/students");
    await s.say("banner", async () => {
      await film.show(page.getByTestId("join-requests-banner"), 2);
      await film.click(page.getByTestId("join-requests-banner"));
      await page.getByTestId("join-requests-title").waitFor();
    });
    const row = page.getByTestId("join-request-row").filter({ hasText: DEMO.newcomer });
    await s.say("list", async () => {
      await film.show(row, 2.4);
    });
    const dialog = page.getByTestId("join-approve-dialog");
    await s.say("approve", async () => {
      await film.click(row.getByTestId("join-approve"));
      await dialog.waitFor();
      await film.show(dialog.getByTestId("join-mode-new"), 1.4);
    });
    await s.say("group", async () => {
      await film.click(
        dialog
          .getByRole("radio", { name: s.label("students.genders.FEMALE") })
          .or(dialog.getByText(s.label("students.genders.FEMALE"), { exact: true })),
      );
      await choose(s, dialog.locator("#join-approve-group"), /GE-Morning A1/);
    });
    await s.say(
      "letIn",
      async () => {
        await film.click(save(dialog));
        await row.waitFor({ state: "detached" });
      },
      1,
    );
    await s.say("declined", async () => {
      await film.click(page.getByTestId("join-tab-declined"));
      await film.show(page.getByTestId("join-request-row").first(), 1.6);
    });
    await s.say("teachers");
  },
};

const coursesRooms: Scene = {
  id: "courses-rooms",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/settings/courses");

    await s.say("settings", async () => {
      await film.show(page.getByRole("navigation", { name: s.label("settings.nav.label") }), 2.2);
    });
    await s.say("courses", async () => {
      await film.show(page.getByTestId("course-row").first(), 2);
    });
    const course = page.getByTestId("course-dialog");
    await s.say("addCourse", async () => {
      await film.click(page.getByTestId("add-button"));
      await course.waitFor();
      await film.type(course.locator("#course-name"), "Kids English");
      await film.type(course.locator("#course-duration"), "6");
      await film.type(course.locator("#course-price"), "400000");
    });
    await s.say("saveCourse", async () => {
      await film.click(save(course));
      await film.show(page.getByTestId("course-row").filter({ hasText: "Kids English" }), 2);
    });
    await s.say("rooms", async () => {
      await film.click(
        page
          .getByRole("navigation", { name: s.label("settings.nav.label") })
          .getByRole("link", { name: s.label("settings.nav.rooms"), exact: true }),
      );
      await page.getByTestId("room-row").first().waitFor();
    });
    const room = page.getByTestId("room-dialog");
    await s.say("addRoom", async () => {
      await film.click(page.getByTestId("add-button"));
      await room.waitFor();
      await film.type(room.locator("#room-name"), "Room 201");
      await film.type(room.locator("#room-capacity"), "14");
      await film.click(save(room));
      await film.show(page.getByTestId("room-row").filter({ hasText: "Room 201" }), 2);
    });
    await s.say("more", async () => {
      await film.show(page.getByRole("navigation", { name: s.label("settings.nav.label") }), 2.4);
    });
  },
};

const NEW_GROUP = "GE-Evening A2";

const groups: Scene = {
  id: "groups",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/groups");

    await s.say("list", async () => {
      await film.show(page.getByTestId("group-row").first(), 2.2);
    });
    const dialog = page.getByTestId("group-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("add-button"));
      await dialog.waitFor();
      await film.type(dialog.locator("#group-name"), NEW_GROUP);
      await choose(s, dialog.locator("#group-course"), "General English");
    });
    await s.say("days", async () => {
      await choose(s, dialog.locator("#group-pattern"), s.label("groups.patterns.EVEN"));
      await film.set(dialog.locator("#group-start"), "18:00");
      await film.set(dialog.locator("#group-end"), "19:30");
    });
    await s.say("room", async () => {
      await choose(s, dialog.locator("#group-room"), "Room 102");
    });
    await s.say("teacher", async () => {
      await film.click(dialog.getByRole("button", { name: s.label("groups.form.addTeacher") }));
      await choose(
        s,
        dialog.getByRole("combobox", { name: s.label("groups.form.teacher") }).first(),
        "Demo Teacher Two",
      );
    });
    await s.say("start", async () => {
      await film.set(dialog.locator("#group-startDate"), nextMonth());
      await film.click(save(dialog));
      // A busy room or teacher is named first; the same button then saves anyway.
      const clash = dialog.getByTestId("group-clashes");
      if (await clash.isVisible().catch(() => false)) await film.click(save(dialog));
      await page.getByTestId("group-row").filter({ hasText: NEW_GROUP }).waitFor();
    });
    await s.say("open", async () => {
      await film.click(
        page.getByTestId("group-row").filter({ hasText: NEW_GROUP }).getByRole("link").first(),
      );
      await page.getByTestId("group-title").waitFor();
      await film.show(page.getByTestId("group-schedule"), 2);
    });
    const member = page.getByTestId("add-member-dialog");
    await s.say("member", async () => {
      await film.click(page.getByTestId("add-member"));
      await member.waitFor();
      await film.type(member.locator("#member-search"), "Demo Student Th");
      await film.click(member.getByRole("option").first());
    });
    await s.say("joined", async () => {
      await film.set(member.locator("#member-joined"), nextMonth());
      await film.click(save(member));
      await page.getByTestId("member-row").first().waitFor();
      await film.show(page.getByTestId("member-row").first(), 1.8);
    });
    await s.say("tabs", async () => {
      await film.show(page.getByRole("tablist").first(), 2.4);
    });
  },
};

const timetable: Scene = {
  id: "timetable",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    // The first room alphabetically may be empty: open the first one with lessons.
    const rooms = await rows<{ id: string }>(s.ceo, "/rooms");
    await film.offCamera(async () => {
      for (const room of rooms) {
        await page.goto(s.url(`/timetable?id=${room.id}`));
        await page.waitForLoadState("networkidle").catch(() => undefined);
        if ((await page.getByTestId("timetable-block").count()) > 0) break;
      }
    });

    await s.say("week", async () => {
      await film.show(page.getByTestId("timetable-block").first(), 2);
    });
    await s.say("pick", async () => {
      await film.click(page.getByTestId("timetable-pick"));
      return () => escape(s);
    });
    await s.say("group", async () => {
      await film.click(page.getByTestId("timetable-block").first());
      await page.getByTestId("group-title").waitFor();
      await film.show(page.getByTestId("group-schedule"), 2);
    });
    const dialog = page.getByTestId("group-dialog");
    await s.say("times", async () => {
      await film.click(page.getByTestId("group-schedule-edit"));
      await dialog.waitFor();
      await film.set(dialog.locator("#group-start"), "10:00");
      await film.set(dialog.locator("#group-end"), "11:30");
    });
    await s.say("from", async () => {
      await film.show(dialog.getByTestId("schedule-change"), 2.4);
    });
    await s.say("saveTimes", async () => {
      await film.click(save(dialog));
      const clash = dialog.getByTestId("group-clashes");
      await film.wait(0.8);
      if (await clash.isVisible().catch(() => false)) await film.click(save(dialog));
      await dialog.waitFor({ state: "hidden" });
    });
    const dayOff = page.getByTestId("day-off-dialog");
    await s.say("dayOff", async () => {
      await film.click(page.getByTestId("group-more"));
      await film.click(menuItem(s, "groups.detail.dayOff"));
      await dayOff.waitFor();
    });
    await s.say("move", async () => {
      // The group's next lesson day: the form refuses a day without a lesson.
      await film.set(dayOff.locator("#dayoff-date"), await nextLesson(s));
      await film.type(dayOff.locator("#dayoff-reason"), typed(s).dayOff);
      await film.click(dayOff.locator("#dayoff-move"));
      await dayOff.getByTestId("dayoff-move-fields").waitFor();
    });
    await s.say("moveTo", async () => {
      const from = await dayOff.locator("#dayoff-date").inputValue();
      const to = new Date(`${from}T00:00:00Z`);
      to.setUTCDate(to.getUTCDate() + 1);
      await film.set(dayOff.locator("#dayoff-move-date"), to.toISOString().slice(0, 10));
      await film.set(dayOff.locator("#dayoff-move-start"), "15:00");
      await film.set(dayOff.locator("#dayoff-move-end"), "16:30");
      await film.click(save(dayOff));
      await page.getByTestId("group-days-off").waitFor();
      await film.show(page.getByTestId("group-days-off"), 2);
    });
  },
};

/** The next date after today on which the demo teacher's group has a lesson. */
async function nextLesson(s: Shoot): Promise<string> {
  const homework = await getJson<{ lessons: Array<{ date: string }>; today: string }>(
    s.ceo,
    `/groups/${s.base.teacherGroupId}/homework`,
  );
  const dates = homework.lessons.map((l) => l.date.slice(0, 10)).sort();
  return dates.find((d) => d > homework.today) ?? day(2);
}

const NEW_STUDENT = { name: "Aziz Rakhimov", phone: "+998931234567", parent: "Nodira Rakhimova" };

const students: Scene = {
  id: "students",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/students");

    await s.say("list", async () => {
      await film.show(page.getByTestId("student-row").first(), 2.2);
    });
    const dialog = page.getByTestId("student-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("add-button"));
      await dialog.waitFor();
      await film.type(dialog.locator("#student-fullName"), NEW_STUDENT.name);
      await film.type(dialog.locator("#student-phone"), NEW_STUDENT.phone);
    });
    await s.say("group", async () => {
      await film.click(dialog.getByTestId("section-group"));
      await choose(s, dialog.locator("#student-group"), /GE-Morning A1/);
      await film.set(dialog.locator("#student-joinedAt"), day(0));
    });
    await s.say("parent", async () => {
      await film.click(dialog.getByTestId("section-parent"));
      await film.type(dialog.locator("#student-parentName"), NEW_STUDENT.parent);
      await film.type(dialog.locator("#student-parentPhone"), "+998901234500");
    });
    await s.say(
      "save",
      async () => {
        await film.click(save(dialog));
        await page.getByTestId("student-title").waitFor();
      },
      1,
    );
    await s.say("profile", async () => {
      await film.show(page.getByTestId("student-group-card").first(), 2.2);
    });
    await s.say("tabs", async () => {
      await film.show(page.getByRole("tablist").first(), 1.6);
      await film.click(page.getByTestId("tab-comments"));
      await film.wait(1.4);
      await film.click(page.getByTestId("tab-parents"));
    });
    await s.go("/students");
    await s.say("many", async () => {
      await film.click(page.getByTestId("student-row").nth(0).getByRole("checkbox"));
      await film.click(page.getByTestId("student-row").nth(1).getByRole("checkbox"));
      await film.show(page.getByTestId("students-bulk"), 2);
    });
    await s.say("import", async () => {
      await film.click(page.getByTestId("students-import-menu"));
      return () => escape(s);
    });
  },
};

const NEW_LEAD = { name: "Sardor Aliev", phone: "+998977001122" };

const leads: Scene = {
  id: "leads",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    // Backstage: two leads were promised a call today.
    await film.offCamera(async () => {
      const board = await getJson<{ columns: Array<{ leads: Array<{ id: string }> }> }>(
        s.ceo,
        "/leads",
      );
      for (const lead of board.columns.flatMap((c) => c.leads).slice(0, 2)) {
        await mutate(s.ceo, "patch", `/leads/${lead.id}`, { nextContactAt: tashkentToday() });
      }
    });
    await s.go("/leads");

    await s.say("board", async () => {
      await film.show(page.getByTestId("kanban"), 2.4);
    });
    const dialog = page.getByTestId("lead-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("add-lead").first());
      await dialog.waitFor();
      await film.type(dialog.locator("#lead-fullName"), NEW_LEAD.name);
      await film.type(dialog.locator("#lead-phone-0"), NEW_LEAD.phone);
      await choose(s, dialog.locator("#lead-sourceId"), "Instagram");
    });
    const card = page.getByTestId("lead-card").filter({ hasText: NEW_LEAD.name });
    await s.say("save", async () => {
      await film.click(save(dialog));
      await card.waitFor();
      await film.show(card, 1.8);
    });
    await s.say("move", async () => {
      await film.click(card.locator('button[aria-haspopup="menu"]'));
      await film.click(page.getByRole("menuitem", { name: named(s.locale, "Contacted") }));
      await film.wait(1);
    });
    const trial = page.getByTestId("trial-dialog");
    await s.say("trial", async () => {
      await film.click(card.locator('button[aria-haspopup="menu"]'));
      await film.click(page.getByTestId("lead-book-trial"));
      await trial.waitFor();
      await choose(s, trial.locator("#trial-group"), /GE-Morning A1/);
    });
    await s.say("trialSave", async () => {
      await film.click(save(trial));
      await card.getByTestId("lead-trial").waitFor();
      await film.show(card.getByTestId("lead-trial"), 1.8);
    });
    await s.say("toGroup", async () => {
      await film.click(card.getByRole("checkbox"));
      await film.click(page.getByTestId("leads-to-group"));
      await page.getByRole("dialog").waitFor();
      return async () => {
        await escape(s);
        if (await card.getByRole("checkbox").isChecked()) await card.getByRole("checkbox").click();
      };
    });
    await s.say(
      "calls",
      async () => {
        await film.click(page.getByTestId("leads-calls"));
        await page.waitForURL(/leads\/calls/);
        await page.waitForLoadState("networkidle").catch(() => undefined);
      },
      1,
    );
    await s.go("/leads/sources");
    await s.say("sources", async () => {
      await film.show(page.getByTestId("source-card").first(), 2);
    });
    await s.go("/forms/website");
    await s.say("form");
  },
};

const payments: Scene = {
  id: "payments",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/students");

    await s.say("student", async () => {
      const rowsOf = page.getByTestId("student-row");
      const debtor = rowsOf.filter({ hasText: "Demo Student One" });
      await film.click(
        ((await debtor.count()) > 0 ? debtor : rowsOf).first().getByRole("link").first(),
      );
      await page.getByTestId("student-title").waitFor();
      await film.show(page.getByTestId("student-group-card").first(), 2);
    });
    const pay = page.getByTestId("payment-dialog");
    await s.say("open", async () => {
      await film.click(page.getByTestId("pay-student"));
      await pay.waitFor();
      await film.show(page.getByTestId("payment-info"), 2.2);
    });
    await s.say("amount", async () => {
      await film.click(pay.getByRole("button", { name: named(s.locale, "Cash") }));
      await film.click(page.getByTestId("pay-autofill"));
    });
    await s.say("save", async () => {
      const receiptPage = page.context().waitForEvent("page");
      await film.click(save(pay));
      const receipt = await receiptPage;
      // The receipt opens in a tab of its own: film it, then come back.
      await film.offCamera(async () => {
        await fit(receipt, DESKTOP);
        await receipt.getByTestId("receipt").waitFor();
      });
      await film.watch(receipt);
      await film.show(receipt.getByTestId("receipt"), 3);
      return async () => {
        await film.watch(page);
        await receipt.close();
      };
    });
    await s.say("history", async () => {
      await film.bring(page.getByTestId("payment-row").first());
      await film.show(page.getByTestId("payment-row").first(), 2);
    });
    await s.say("anywhere", async () => {
      await film.scroll(-2000);
      await film.click(page.getByTestId("pay-button"));
      // Set at once: between slow keystrokes the list would say "nothing found".
      const search = page.getByTestId("pay-search");
      await film.set(search.locator("input").first(), "Demo Student T");
      await search.locator("li button").first().waitFor();
      return async () => {
        await escape(s);
        await escape(s);
      };
    });
    await s.go("/debts");
    await s.say("debtors", async () => {
      await film.show(page.getByTestId("debt-row").first(), 2.4);
    });
    await s.say("remind", async () => {
      await film.click(
        page.getByTestId("debt-row").first().locator('button[aria-haspopup="menu"]').last(),
      );
      return () => escape(s);
    });
    await s.go("/settings/payments");
    await s.say("log", async () => {
      await film.show(page.getByTestId("payment-row").first(), 2);
    });
  },
};

/** The last date up to today on which the demo teacher's group had a lesson. */
async function lastLesson(s: Shoot): Promise<string> {
  const homework = await getJson<{ lessons: Array<{ date: string }>; today: string }>(
    s.ceo,
    `/groups/${s.base.teacherGroupId}/homework`,
  );
  const dates = homework.lessons.map((l) => l.date.slice(0, 10)).sort();
  return dates.filter((d) => d <= homework.today).at(-1) ?? homework.today;
}

const attendance: Scene = {
  id: "attendance",
  async run(s) {
    const { film, page } = s;
    await s.signIn(TEACHER);
    const date = await lastLesson(s);
    await s.go(date === tashkentToday() ? "/today" : `/today?date=${date}`);
    const lesson = page.getByTestId("today-lesson").first();

    await s.say("day", async () => {
      await film.show(lesson, 2.4);
    });
    await s.say("present", async () => {
      const all = lesson.getByTestId("today-all-present");
      if ((await all.count()) > 0) await film.click(all);
      await film.show(lesson.getByTestId("today-attendance-summary"), 1.6);
    });
    await s.say("absent", async () => {
      await film.click(lesson.getByTestId("today-member").nth(1));
      await film.wait(0.8);
    });
    await s.say("homework", async () => {
      const set = lesson.getByTestId("today-homework-set");
      if ((await set.count()) > 0) {
        await film.click(set);
        await film.type(lesson.getByTestId("today-homework-text"), "Workbook p. 26, exercises 1-3");
        await film.click(lesson.getByTestId("today-homework-save"));
      } else {
        await film.show(lesson.getByTestId("today-homework"), 2);
      }
    });
    await s.say("group", async () => {
      await film.click(lesson.getByTestId("today-lesson-group"));
      await page.getByTestId("attendance-grid").waitFor();
      await film.show(page.getByTestId("attendance-grid"), 2.4);
    });
    await s.say("cell", async () => {
      await film.click(page.getByTestId("attendance-row").nth(2).getByRole("button").last());
      await film.wait(0.8);
    });
    await s.say("grades", async () => {
      await film.click(page.getByTestId("tab-grades"));
      const mark = page.getByTestId("grades-grid").getByRole("spinbutton").last();
      await film.type(mark, "5");
      await page.keyboard.press("Tab");
    });
    await s.say("phone");
  },
};

const videoLesson: Scene = {
  id: "video-lesson",
  async run(s) {
    const { film } = s;
    const dir = mkdtempSync(path.join(os.tmpdir(), "kampus-call-"));
    const fake = (camera: string) => [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
      `--use-file-for-fake-video-capture=${camera}`,
    ];
    const media = ["camera", "microphone"];
    // Two browsers, each with a drawn portrait in place of a camera.
    const teacherBrowser = await launch(DESKTOP, fake(await cameraFile(s.browser, dir, "teacher")));
    const studentBrowser = await launch(PHONE, fake(await cameraFile(s.browser, dir, "student")));
    try {
      const [, teacher] = await open(teacherBrowser, DESKTOP, {
        permissions: [...media, "clipboard-write"],
      });
      const [, student] = await open(studentBrowser, PHONE, { permissions: media });
      await teacher.addInitScript(() => localStorage.setItem("kampus.summary.auto", "off"));
      await film.watch(teacher);
      await s.signIn(TEACHER, teacher);
      await s.go(`/groups/${s.base.teacherGroupId}`, teacher);
      const card = teacher.getByTestId("group-video");

      await s.say("card", async () => {
        await film.show(card, 2.4);
      });
      await s.say("start", async () => {
        const start = card.getByTestId("video-start");
        await film.click((await start.isVisible()) ? start : card.getByTestId("video-join"));
        await teacher.getByTestId("join-call").waitFor();
        await film.wait(1.2);
        await film.click(teacher.getByTestId("join-call"));
        await teacher.getByTestId("call-room").waitFor();
      });
      await s.say(
        "link",
        async () => {
          await film.click(teacher.getByTestId("copy-lesson-link"));
          await teacher.getByTestId("lesson-link-notice").waitFor();
        },
        1,
      );

      // The student's side, on a phone.
      await film.watch(student);
      await s.go(`/class/${s.base.studentToken}`, student);
      await s.say("student", async () => {
        await film.click(student.getByTestId("join-call"));
        await student.getByTestId("call-room").waitFor();
        await teacher.getByTestId("tile-peer").first().waitFor();
        await film.wait(2.5);
      });

      await film.watch(teacher);
      await s.say("room", async () => {
        await student.getByTestId("toggle-hand").click();
        await teacher.getByTestId("hand-mark").first().waitFor();
        await film.show(teacher.getByTestId("tile-peer").first(), 2);
      });
      await s.say("chat", async () => {
        await film.click(teacher.getByTestId("toggle-chat"));
        await film.type(teacher.getByTestId("chat-input"), DEMO.callChat);
        await film.click(teacher.getByTestId("chat-send"));
        await student.getByTestId("toggle-chat").click();
        await student.getByTestId("chat-input").fill(DEMO.callReply);
        await student.getByTestId("chat-input").press("Enter");
        await closePhonePanel(student);
        await teacher.getByTestId("chat-message").nth(1).waitFor();
        return async () => {
          await film.click(teacher.getByTestId("toggle-chat"));
          await student.getByTestId("toggle-hand").click();
        };
      });
      const stage = teacher.getByTestId("material-stage");
      await s.say("file", async () => {
        await film.click(teacher.getByTestId("toggle-lesson"));
        await film.click(
          teacher
            .getByTestId("lesson-panel")
            .getByTestId("lesson-material")
            .filter({ hasText: DEMO.material })
            .first()
            .getByTestId("lesson-material-show"),
        );
        await stage.getByTestId("material-pdf-page").waitFor();
        await film.click(stage.getByTestId("material-next"));
      });
      await s.say("pen", async () => {
        await film.click(stage.getByTestId("material-pen"));
        const sheet = stage.getByTestId("material-page-box");
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
          await film.wait(0.5);
        }
      });
      await film.offCamera(async () => {
        await teacher
          .getByTestId("material-stop")
          .click({ timeout: 5000 })
          .catch(() => undefined);
        if (await teacher.getByTestId("lesson-panel").isVisible()) {
          await teacher.getByTestId("toggle-lesson").click();
        }
      });
      await s.say("board", async () => {
        await film.click(teacher.getByTestId("toggle-board"));
        const canvas = teacher.getByTestId("board-canvas");
        await canvas.waitFor();
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
          await film.wait(0.3);
        }
        for (const x of [0.25, 0.5]) {
          await stroke(teacher, canvas, [
            [x, 0.4],
            [x + 0.06, 0.3],
            [x + 0.125, 0.27],
            [x + 0.19, 0.3],
            [x + 0.25, 0.4],
          ]);
          await film.wait(0.3);
        }
        return () => film.click(teacher.getByTestId("toggle-board"));
      });
      await s.say("poll", async () => {
        await film.click(teacher.getByTestId("toggle-poll"));
        if (await teacher.getByTestId("poll-new").isVisible()) {
          await film.click(teacher.getByTestId("poll-new"));
        }
        await film.type(teacher.getByTestId("poll-question-input"), DEMO.poll.question);
        const inputs = teacher.getByTestId("poll-option-input");
        await film.type(inputs.nth(0), DEMO.poll.options[0]!);
        await film.type(inputs.nth(1), DEMO.poll.options[1]!);
        await film.click(teacher.getByTestId("poll-open"));
        await student.getByTestId("poll-notice").click();
        await student.getByTestId("poll-option").first().click();
        await closePhonePanel(student);
        await teacher.getByTestId("poll-question").waitFor();
        await film.wait(2);
      });
      await s.say(
        "end",
        async () => {
          await teacher
            .getByTestId("poll-close")
            .click()
            .catch(() => undefined);
          await film.click(teacher.getByTestId("end-call"));
          await film.click(teacher.getByRole("alertdialog").getByRole("button").last());
          await teacher.getByTestId("call-done").waitFor();
        },
        1,
      );
    } finally {
      await teacherBrowser.close();
      await studentBrowser.close();
    }
  },
};

const homework: Scene = {
  id: "homework",
  async run(s) {
    const { film, page } = s;
    const g = s.base.teacherGroupId;
    await s.signIn(TEACHER);
    // Backstage: two more students have answered the homework already given, so several answers wait.
    await film.offCamera(async () => {
      const links = await getJson<Array<{ token: string }>>(s.ceo, `/groups/${g}/video/links`);
      const answers = [
        "I get up at six. I go to work by bus. My brother plays football on Sunday.",
        "She get up at seven. She have breakfast. She go to school.",
      ];
      for (const [i, link] of links.slice(1, 3).entries()) {
        const theirs = await getJson<Array<{ id: string; text?: string }>>(
          page,
          `/public/class/${link.token}/homework`,
        ).catch(() => []);
        const given = theirs.find((h) => h.text === DEMO.homework);
        if (given) {
          await asStudent(page, link.token, `/homework/${given.id}`, {
            multipart: { note: answers[i]! },
          }).catch(() => undefined);
        }
      }
    });
    await s.go(`/groups/${g}?tab=homework`);
    const text = "Read the text on p. 30 and answer questions 1-5 in full sentences.";

    await s.say("tab", async () => {
      await film.show(page.getByTestId("homework-card").first(), 2.2);
    });
    const dialog = page.getByTestId("homework-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("homework-add"));
      await dialog.waitFor();
      await film.click(dialog.getByTestId("hw-lesson"));
      await film.click(
        page
          .getByRole("option")
          .filter({ hasNotText: s.label("groups.homework.hasHomework") })
          .first(),
      );
    });
    await s.say("text", async () => {
      await film.type(dialog.getByTestId("hw-text"), text);
      await film.click(save(dialog));
      await page.getByTestId("homework-card").filter({ hasText: text }).waitFor();
    });
    await s.say("student", async () => {
      // Backstage a student sends an answer, the way they would from their page.
      const mine = await getJson<Array<{ id: string; text?: string }>>(
        page,
        `/public/class/${s.base.studentToken}/homework`,
      );
      const fresh = mine.find((h) => h.text === text) ?? mine[0];
      if (fresh) {
        await asStudent(page, s.base.studentToken, `/homework/${fresh.id}`, {
          multipart: {
            note: "1. He lives in Samarkand. 2. He gets up at six. 3. He works at a school.",
          },
        }).catch(() => undefined);
      }
      await film.show(page.getByTestId("homework-card").first(), 1.6);
    });
    await s.say("checking", async () => {
      await film.click(nav(s, "nav.checking"));
      await page.getByTestId("checking-item").first().waitFor();
      await film.show(
        page.getByTestId("checking-item").first().getByTestId("checking-answer"),
        2.2,
      );
    });
    await s.say("accept", async () => {
      await film.click(page.getByTestId("checking-item").first().getByTestId("checking-accept"));
      await film.wait(1);
    });
    await s.say("return", async () => {
      const next = page.getByTestId("checking-item").first();
      if ((await next.count()) === 0) return;
      await film.click(next.getByTestId("checking-return"));
      await film.type(
        next.getByTestId("checking-comment"),
        "Check the verbs after he and she, then send it again.",
      );
      await film.click(next.getByTestId("checking-return-send"));
    });
    await s.say("coins", async () => {
      await film.show(page.getByTestId("checking-summary"), 2);
    });
  },
};

const materialsChat: Scene = {
  id: "materials-chat",
  async run(s) {
    const { film, page } = s;
    const g = s.base.teacherGroupId;
    await s.signIn(TEACHER);
    await s.go(`/groups/${g}?tab=materials`);

    await s.say("materials", async () => {
      await film.show(page.getByTestId("material-row").first(), 2.2);
    });
    const dialog = page.getByTestId("material-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("material-add"));
      await dialog.waitFor();
      await choose(s, dialog.getByTestId("mt-kind"), s.label("groups.materials.kinds.LINK"));
      await film.type(dialog.getByTestId("mt-title"), "Present Simple: video");
      await film.type(
        dialog.getByTestId("mt-url"),
        "https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/present-simple",
      );
    });
    await s.say(
      "save",
      async () => {
        await film.click(save(dialog));
        await page.getByTestId("material-row").filter({ hasText: "Present Simple" }).waitFor();
      },
      1,
    );
    await s.say("stream", async () => {
      await film.click(page.getByTestId("tab-stream"));
      await page.getByTestId("stream-compose").waitFor();
      await film.type(
        page.getByTestId("stream-compose").locator("textarea").first(),
        typed(s).post,
      );
      await film.click(page.getByTestId("stream-send"));
    });
    await s.say("comments", async () => {
      await film.show(page.getByTestId("stream-post").last(), 2);
    });
    await s.say("chat", async () => {
      await film.click(page.getByTestId("tab-chat"));
      await page.getByTestId("group-chat-input").waitFor();
      await film.type(page.getByTestId("group-chat-input"), typed(s).chat);
      await film.click(page.getByTestId("group-chat-send"));
    });
    await s.say("where");
  },
};

const exams: Scene = {
  id: "exams",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/exams");

    await s.say("list", async () => {
      await film.show(page.getByTestId("exam-row").first(), 2.2);
    });
    const dialog = page.getByTestId("exam-dialog");
    await s.say("add", async () => {
      await film.click(page.getByTestId("add-button"));
      await dialog.waitFor();
      await film.type(dialog.locator("#exam-name"), "Unit 3 test");
      await choose(s, dialog.locator("#exam-groupId"), /GE-Morning A1/);
    });
    await s.say("marks", async () => {
      await film.set(dialog.locator("#exam-date"), day(3));
      await film.type(dialog.locator("#exam-max"), "100");
      await film.type(dialog.locator("#exam-pass"), "60");
    });
    await s.say(
      "save",
      async () => {
        await film.click(save(dialog));
        await page.getByTestId("exam-row").filter({ hasText: "Unit 3 test" }).waitFor();
      },
      1,
    );
    await s.say("results", async () => {
      await film.click(
        page.getByTestId("exam-row").filter({ hasText: "Unit 3 test" }).getByRole("link").first(),
      );
      await page.getByTestId("result-row").first().waitFor();
      const scores = page.getByTestId("result-row").locator('input[type="number"]');
      for (const [i, score] of ["82", "74", "55"].entries()) {
        if (i < (await scores.count())) await film.type(scores.nth(i), score);
      }
    });
    await s.say("saveResults", async () => {
      await film.click(page.getByTestId("save-results"));
      await film.wait(1.2);
    });
    await s.say(
      "mock",
      async () => {
        await film.click(nav(s, "nav.exams"));
        await page.getByTestId("exam-tab-MOCK").waitFor();
        await film.click(page.getByTestId("exam-tab-MOCK"));
      },
      1,
    );
    await s.say("student");
  },
};

const testsCoins: Scene = {
  id: "tests-coins",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/settings/tests");

    await s.say("tests", async () => {
      await film.show(page.getByTestId("test-row").first(), 2.2);
    });
    await s.say("bank", async () => {
      await film.click(page.getByTestId("tests-tab-bank"));
      await page.getByTestId("question-row").first().waitFor();
      await film.show(page.getByTestId("question-row").first(), 2);
    });
    await s.say("question", async () => {
      await film.click(page.getByTestId("add-button"));
      await page.getByTestId("question-dialog").waitFor();
      return () => escape(s);
    });
    await s.go("/settings/tests");
    await s.say("portal", async () => {
      // The test that has been taken: its page lists the groups and every attempt.
      const taken = page.getByTestId("test-row").last();
      await film.click(taken.getByRole("link").first());
      await page.getByTestId("test-title").waitFor();
      const attempt = page.getByTestId("attempt-row").first();
      if ((await attempt.count()) > 0) await film.show(attempt, 2);
    });
    await s.go("/settings/coins");
    await s.say("rules", async () => {
      await film.show(page.getByTestId("coin-rule").first(), 2.2);
    });
    await s.say("auto", async () => {
      await film.show(page.getByTestId("auto-coins"), 2.2);
    });
    await s.go("/reports/coins");
    await s.say(
      "report",
      async () => {
        await film.scroll(260);
      },
      1.5,
    );
  },
};

const announcements: Scene = {
  id: "announcements",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    // Backstage: an announcement from last week, so the list is not empty.
    await film.offCamera(async () => {
      const posted = await getJson<{ total: number }>(s.ceo, "/announcements");
      if (posted.total === 0) {
        await mutate(s.ceo, "post", "/announcements", {
          audience: "CENTRE",
          title: typed(s).earlierTitle,
          body: typed(s).earlier,
          sendSms: false,
        });
      }
    });
    await s.go("/announcements");

    await s.say("list", async () => {
      await film.show(page.getByTestId("announcement-row").first(), 2);
    });
    const dialog = page.getByTestId("announcement-dialog");
    await s.say("new", async () => {
      await film.click(page.getByTestId("announcements-new"));
      await dialog.waitFor();
      await film.click(dialog.getByTestId("announcement-audience"));
      await film.wait(1.6);
      await film.click(page.getByRole("option").first());
    });
    await s.say("write", async () => {
      await film.type(dialog.getByTestId("announcement-title-input"), typed(s).noticeTitle);
      await film.type(dialog.getByTestId("announcement-body"), typed(s).notice);
    });
    await s.say("sms", async () => {
      await film.show(dialog.getByTestId("announcement-sms"), 2);
    });
    await s.say("send", async () => {
      await film.click(save(dialog));
      await page
        .getByTestId("announcement-row")
        .filter({ hasText: typed(s).noticeTitle })
        .first()
        .waitFor();
      await film.show(page.getByTestId("announcement-row").first(), 2);
    });
    await s.say("reads", async () => {
      await film.show(page.getByTestId("announcement-reads").first(), 2);
    });
  },
};

/** What the demo CEO's cash desk holds today in the first branch, as "Close the day" counts it. */
async function cashToday(s: Shoot) {
  const me = await getJson<{ branches: Array<{ id: string }> }>(s.ceo, "/auth/me");
  return getJson<{
    expectedCash: number;
    methods: Array<{ methodId: string | null; isCash: boolean }>;
  }>(s.ceo, `/cashdesk/preview?branchId=${me.branches[0]!.id}&date=${tashkentToday()}`);
}

const finance: Scene = {
  id: "finance",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    // Backstage: last month's salaries are counted and saved, and the cash desk took a payment today.
    await film.offCamera(async () => {
      const [y, m] = tashkentToday().split("-").map(Number);
      const last = m === 1 ? `${y! - 1}-12-01` : `${y}-${String(m! - 1).padStart(2, "0")}-01`;
      await getJson(s.ceo, `/payroll/${last}`);
      await mutate(s.ceo, "put", `/payroll/${last}`, { status: "SAVED" }).catch(() => undefined);
      const cash = await cashToday(s);
      if (cash.expectedCash < 300000) {
        const debts = await rows<{ groups: Array<{ membershipId: string; balance: number }> }>(
          s.ceo,
          "/debts?pageSize=20",
        );
        const owed = debts.flatMap((d) => d.groups).find((g) => g.balance <= -650000);
        const method = cash.methods.find((x) => x.isCash);
        if (owed && method) {
          await mutate(s.ceo, "post", "/payments", {
            membershipId: owed.membershipId,
            paymentMethodId: method.methodId,
            amount: 650000,
            effectiveMonth: tashkentToday().slice(0, 7),
            paidAt: tashkentToday(),
          }).catch(() => undefined);
        }
      }
    });
    await s.go("/finance");

    await s.say("overview", async () => {
      await film.show(page.locator('[data-testid^="kpi-"]').first(), 2.2);
    });
    const dialog = page.getByTestId("entry-dialog");
    await s.say("expense", async () => {
      // An expense category of the seed: its page lists the entries and adds new ones.
      const card = page
        .locator('#chiqimlar [data-testid="category-card"]')
        .filter({ hasText: named(s.locale, "Boshqalar") })
        .first();
      await film.bring(card);
      await film.click(card);
      await page.waitForURL(/finance\/costs\//);
      await film.click(page.getByTestId("add-button"));
      await dialog.waitFor();
      // Paid by card, so it does not come out of the cash desk counted below.
      await choose(s, dialog.locator("#entry-paymentMethodId"), named(s.locale, "Card"));
      await film.type(dialog.locator("#entry-amount"), "350000");
      await film.type(dialog.locator("#entry-comment"), typed(s).expense);
    });
    await s.say(
      "saveExpense",
      async () => {
        await film.click(save(dialog));
        await dialog.waitFor({ state: "hidden" });
        await film.show(page.getByTestId("entry-row").first(), 1.6);
      },
      1,
    );
    await s.go("/finance");
    await s.say("charts", async () => {
      await film.bring(page.getByTestId("donut"));
      await film.show(page.getByTestId("donut"), 2);
    });
    await s.say("payroll", async () => {
      await film.bring(page.getByTestId("payroll-history"));
      await film.show(page.getByTestId("payroll-history"), 2);
    });
    const [year, month] = tashkentToday().split("-");
    await s.go(`/finance/salary-detail/${year}-${month}-01`);
    await s.say("salary", async () => {
      await film.show(page.getByTestId("payroll-line").first(), 2.4);
    });
    await s.go("/cashdesk");
    const close = page.getByTestId("close-day-dialog");
    await s.say("cash", async () => {
      await film.click(page.getByTestId("close-day"));
      await close.waitFor();
      await film.show(close.getByTestId("close-preview"), 2.2);
    });
    await s.say("count", async () => {
      // Twenty thousand short, the way a real count sometimes comes out.
      const { expectedCash } = await cashToday(s);
      await film.type(close.locator("#close-counted"), String(Math.max(expectedCash - 20000, 0)));
      await film.show(close.getByTestId("close-difference"), 2);
      await film.click(save(close));
      await close.waitFor({ state: "hidden" });
      await film.show(page.getByTestId("cash-close-row").first(), 2);
    });
  },
};

const reports: Scene = {
  id: "reports",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/reports");

    await s.say("index", async () => {
      await film.show(page.getByTestId("report-payments"), 2);
    });
    await s.say("payments", async () => {
      await film.click(page.getByTestId("report-payments"));
      await page.waitForURL(/reports\/payments/);
      await page.getByTestId("report-filters").waitFor();
      await film.show(page.getByTestId("report-filters"), 2);
    });
    await s.say(
      "staff",
      async () => {
        await film.scroll(320);
      },
      1,
    );
    await s.go("/reports/churn");
    await s.say(
      "churn",
      async () => {
        await film.scroll(240);
      },
      1.5,
    );
    await s.go("/reports/students");
    await s.say(
      "students",
      async () => {
        await film.click(page.getByTestId("students-tab-performance"));
      },
      1.5,
    );
    await s.go("/reports/leads");
    await s.say(
      "leads",
      async () => {
        await film.scroll(240);
      },
      1.5,
    );
    await s.go("/reports/statistics");
    await s.say(
      "statistics",
      async () => {
        await film.scroll(240);
      },
      1.5,
    );
    await s.go("/reports/payments");
    await s.say("excel", async () => {
      await film.show(page.getByTestId("report-excel"), 2);
    });
  },
};

const STUDENT = "+998911000001";

const studentPortal: Scene = {
  id: "student-portal",
  async run(s) {
    const { film } = s;
    const phone = await launch(PHONE);
    try {
      const [, page] = await open(phone, PHONE);
      await film.watch(page);
      await s.go("/student/login", page);

      await s.say("address", async () => {
        await film.show(page.getByTestId("student-login"), 2.4);
      });
      await s.say("phone", async () => {
        await film.type(page.getByLabel(s.label("auth.phone")), STUDENT);
        await film.click(page.getByTestId("login-get-code"));
        await page.getByTestId("phone-code-step").waitFor();
        await shareNumber(page, STUDENT, "Demo Student");
      });
      await s.say("code", async () => {
        await film.type(page.getByLabel(s.label("auth.code")), STUDENT.slice(-6));
        await film.click(page.getByRole("button", { name: s.label("auth.confirmCode") }));
        await page.waitForURL(/\/student(\/set-password)?/);
        await page.waitForLoadState("networkidle").catch(() => undefined);
      });
      await s.say("password", async () => {
        const later = page.getByTestId("set-password-later");
        if ((await later.count()) > 0) {
          await film.show(page.getByTestId("set-password-form"), 2);
          await film.click(later);
        }
        await page.getByTestId("student-home").waitFor();
      });
      await s.say("home", async () => {
        await film.show(page.getByTestId("student-group").first(), 2);
        await film.click(page.getByTestId("student-open-group").first());
        await page.getByTestId("class-title").waitFor();
      });
      await s.say(
        "lesson",
        async () => {
          await film.show(page.getByTestId("class-title"), 1.4);
          await film.click(page.getByTestId("portal-tab-schedule"));
        },
        1.5,
      );
      await s.say("homework", async () => {
        await film.click(page.getByTestId("portal-tab-homework"));
        await film.bring(page.getByTestId("portal-tab-homework"));
        const item = page.getByTestId("portal-homework-item").first();
        const answer = item.getByTestId("hw-answer");
        if ((await answer.count()) > 0) {
          await film.click(answer);
          await film.type(item.getByTestId("hw-note"), "I get up at seven. I go to school by bus.");
          await film.click(item.getByTestId("hw-send"));
        }
      });
      await s.say(
        "materials",
        async () => {
          await film.click(page.getByTestId("portal-tab-materials"));
          await film.wait(1.4);
          await film.click(page.getByTestId("portal-tab-chat"));
        },
        1,
      );
      await s.say(
        "results",
        async () => {
          await film.click(page.getByTestId("portal-tab-results"));
          await film.scroll(260);
        },
        1,
      );
      await s.say("money", async () => {
        const money = page.getByTestId("portal-tab-money");
        if ((await money.count()) > 0) await film.click(money);
        const pay = page.getByTestId("portal-pay").first();
        if ((await pay.count()) > 0) await film.show(pay, 2);
      });
      if (s.base.familyToken) await s.go(`/family/${s.base.familyToken}`, page);
      await s.say("parents", async () => {
        const child = page.getByTestId("family-child").first();
        if ((await child.count()) > 0) await film.show(child, 2);
      });
    } finally {
      await phone.close();
    }
  },
};

const integrations: Scene = {
  id: "integrations",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/settings/integrations");

    await s.say("page");
    await s.say("telegram", async () => {
      await film.bring(page.getByTestId("integration-telegram"));
      await film.show(page.getByTestId("integration-telegram"), 2.6);
    });
    await s.say("sms", async () => {
      await film.bring(page.getByTestId("integration-sms"));
      await film.show(page.getByTestId("integration-sms"), 2.2);
    });
    await s.say("payments", async () => {
      await film.bring(page.getByTestId("integration-payme"));
      await film.show(page.getByTestId("integration-payme"), 2.2);
    });
    await s.say("video", async () => {
      await film.bring(page.getByTestId("integration-video"));
      await film.show(page.getByTestId("integration-video"), 2.2);
    });
    await s.say(
      "others",
      async () => {
        for (const card of ["integration-fiscal", "integration-ai"]) {
          await film.bring(page.getByTestId(card));
          await film.show(page.getByTestId(card), 1.6);
        }
      },
      1,
    );
    await s.go("/settings/bot");
    await s.say(
      "bot",
      async () => {
        await film.wait(1.5);
      },
      1,
    );
  },
};

const assistant: Scene = {
  id: "assistant",
  async run(s) {
    const { film, page } = s;
    await s.signIn(CEO);
    await s.go("/dashboard");
    const panel = page.getByTestId("assistant-panel");

    await s.say("button", async () => {
      await film.show(page.getByTestId("assistant-fab"), 2);
    });
    await s.say("summary", async () => {
      await film.click(page.getByTestId("assistant-fab"));
      await panel.getByTestId("briefing-line").first().waitFor();
      await film.show(panel.getByTestId("briefing-line").first(), 2.2);
    });
    // Nothing is sent: the demo centre has no API key, so its answers are stand-ins, not the real thing.
    await s.say("ask", async () => {
      await film.click(panel.getByTestId("assistant-tab-chat"));
      await film.show(panel.getByTestId("assistant-panel-suggestion").first(), 2.2);
    });
    await s.say("type", async () => {
      await film.type(panel.getByTestId("assistant-panel-input"), typed(s).question);
      await film.show(panel.getByTestId("assistant-panel-send"), 1.6);
    });
    await s.say(
      "page",
      async () => {
        await film.click(panel.getByTestId("assistant-panel-close"));
        await film.click(nav(s, "nav.assistant"));
        await page.getByTestId("assistant-page").waitFor();
      },
      1,
    );
    await s.say("key", async () => {
      await film.show(page.getByTestId("assistant-mode"), 2.4);
    });
  },
};

export const SCENES: Scene[] = [
  signIn,
  gettingAround,
  dashboard,
  staff,
  signInRequests,
  coursesRooms,
  groups,
  timetable,
  students,
  leads,
  payments,
  attendance,
  videoLesson,
  homework,
  materialsChat,
  exams,
  testsCoins,
  announcements,
  finance,
  reports,
  studentPortal,
  integrations,
  assistant,
];
