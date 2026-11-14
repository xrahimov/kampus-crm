import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

/* The server counts in Tashkent days (A-193), so the test's dates do too. */
const tashkent = (offsetDays = 0) =>
  new Date(Date.now() + 5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

async function headersOf(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

async function setTeacherSwitch(page: Page, on: boolean) {
  const headers = await headersOf(page);
  const settings = (await (
    await page.request.get("/api/v1/settings/org", { headers })
  ).json()) as Record<string, unknown>;
  const saved = await page.request.put("/api/v1/settings/org", {
    headers,
    data: { ...settings, teacherCanChangeSchedule: on },
  });
  expect(saved.ok()).toBe(true);
}

test.describe("a time of its own per lesson day (A-193)", () => {
  test("the group's teacher moves a running group to Monday 20:30 and Friday 16:30; its past stays", async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, CEO_PHONE);
    await setTeacherSwitch(page, true);
    const name = `E2E Times ${Date.now()}`;
    let groupId = "";

    try {
      // The director opens a group that has been running for four weeks, Tue/Thu/Sat 13:00.
      await page.goto("/en/groups");
      await page.getByTestId("add-button").click();
      const create = page.getByTestId("group-dialog");
      await create.getByLabel("Group name").fill(name);
      await create.getByLabel("Course").click();
      await page.getByRole("option", { name: "IELTS Preparation" }).click();
      await create.locator("#group-start").fill("13:00");
      await create.locator("#group-end").fill("14:30");
      await create.getByLabel("Start date").fill(tashkent(-28));
      await create.getByRole("button", { name: "Add teacher" }).click();
      await create.getByRole("combobox", { name: "Teacher" }).first().click();
      await page.getByRole("option", { name: "Demo Teacher", exact: true }).click();
      // A new group has no earlier times to keep, so the form does not ask from when.
      await expect(create.getByTestId("schedule-change")).toHaveCount(0);
      await create.getByRole("button", { name: "Save" }).click();
      await expect(create).toBeHidden();
      const row = page.getByTestId("group-row").filter({ hasText: name });
      await expect(row).toContainText("13:00 – 14:30");
      await row.getByRole("link", { name }).click();
      await expect(page.getByTestId("group-title")).toHaveText(name);
      groupId = page.url().split("/groups/")[1]!.split("?")[0]!;

      // Its teacher sees "Change times", not the full edit.
      const teacher = await (await browser.newContext()).newPage();
      await signIn(teacher, TEACHER_PHONE);
      await teacher.goto(`/en/groups/${groupId}`);
      await expect(teacher.getByTestId("group-title")).toHaveText(name);
      await expect(teacher.getByTestId("group-edit")).toHaveCount(0);
      await teacher.getByTestId("group-schedule-edit").click();
      const dialog = teacher.getByTestId("group-dialog");
      await expect(dialog).toContainText("Change lesson times");
      await expect(dialog.getByLabel("Group name")).toHaveCount(0);

      await dialog.getByLabel("Days", { exact: true }).click();
      await teacher.getByRole("option", { name: "Custom" }).click();
      // The days the group has now come ticked; they give way to Monday and Friday.
      for (const day of ["Tue", "Thu", "Sat"]) {
        await expect(dialog.getByLabel(day, { exact: true })).toBeChecked();
        await dialog.getByLabel(day, { exact: true }).click();
      }
      await dialog.getByLabel("Mon", { exact: true }).click();
      await dialog.getByLabel("Fri", { exact: true }).click();
      await dialog.getByTestId("group-perday").click();
      // Each day's row starts from the common time and takes its own.
      const monday = dialog.getByTestId("group-day-1");
      const friday = dialog.getByTestId("group-day-5");
      await expect(monday.getByLabel("Monday: Start")).toHaveValue("13:00");
      await monday.getByLabel("Monday: Start").fill("20:30");
      await monday.getByLabel("Monday: End").fill("20:00");
      await friday.getByLabel("Friday: Start").fill("16:30");
      await friday.getByLabel("Friday: End").fill("18:00");

      // A running group: the form says from when, today by default, and offers the notice.
      const change = dialog.getByTestId("schedule-change");
      await expect(change.getByLabel("New times start from")).toHaveValue(tashkent());
      await expect(change.getByTestId("schedule-notify")).toBeChecked();

      // Monday ends before it starts: refused on that row.
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog.locator("#group-day-1-error")).toBeVisible();
      await monday.getByLabel("Monday: End").fill("22:00");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toBeHidden();

      const schedule = teacher.getByTestId("group-schedule");
      await expect(schedule).toContainText("Monday");
      await expect(schedule).toContainText("20:30 – 22:00");
      await expect(schedule).toContainText("Friday");
      await expect(schedule).toContainText("16:30 – 18:00");
      await expect(schedule).not.toContainText("Tuesday");

      // The four weeks behind the group are still Tue/Thu/Sat at 13:00; from today on it is Mon and Fri.
      const headers = await headersOf(page);
      const today = tashkent();
      const lessons: Array<{ date: string; startTime: string }> = [];
      for (const month of new Set([tashkent(-28), today, tashkent(28)].map((d) => d.slice(0, 7)))) {
        const grid = (await (
          await page.request.get(`/api/v1/groups/${groupId}/lessons?month=${month}`, { headers })
        ).json()) as { lessons: Array<{ date: string; startTime: string }> };
        lessons.push(...grid.lessons);
      }
      const past = lessons.filter((l) => l.date < today);
      const ahead = lessons.filter((l) => l.date >= today);
      expect(past.length).toBeGreaterThanOrEqual(11);
      expect(
        past.every((l) => l.startTime === "13:00" && [2, 4, 6].includes(weekdayOf(l.date))),
      ).toBe(true);
      expect(ahead.length).toBeGreaterThanOrEqual(6);
      for (const l of ahead) {
        expect([1, 5]).toContain(weekdayOf(l.date));
        expect(l.startTime).toBe(weekdayOf(l.date) === 1 ? "20:30" : "16:30");
      }

      // The list shows each day with its own time, and the history names the teacher.
      await page.goto(`/en/groups?q=${encodeURIComponent(name)}`);
      const times = page
        .getByTestId("group-row")
        .filter({ hasText: name })
        .getByTestId("group-times");
      await expect(times).toContainText("Mon 20:30 – 22:00");
      await expect(times).toContainText("Fri 16:30 – 18:00");

      // With the centre's switch off the teacher has no such button.
      await setTeacherSwitch(page, false);
      await teacher.reload();
      await expect(teacher.getByTestId("group-title")).toHaveText(name);
      await expect(teacher.getByTestId("group-schedule-edit")).toHaveCount(0);
      await teacher.context().close();
    } finally {
      await setTeacherSwitch(page, false);
      // The teacher is taken off and the group archived, so the seed teacher's own
      // groups are what the other specs expect and a second run never clashes with this one.
      if (groupId) {
        const headers = await headersOf(page);
        const freed = await page.request.patch(`/api/v1/groups/${groupId}`, {
          headers,
          data: { teachers: [] },
        });
        expect(freed.ok()).toBe(true);
        await page.request.delete(`/api/v1/groups/${groupId}`, { headers });
      }
    }
  });
});
