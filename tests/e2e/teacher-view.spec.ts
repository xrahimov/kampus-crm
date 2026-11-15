import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const NAME = `E2E Najot ${STAMP}`;
const PHONE = `+9989${String(STAMP).slice(-8)}`;
const STUDENT_PHONE = `+9987${String(STAMP).slice(-8)}`;
const TEMPORARY = "Temporary-pass-1";
const OWN = "My-own-password-2";

/* The server counts in Tashkent days, so the test's dates do too. */
const tashkent = (offsetDays = 0) =>
  new Date(Date.now() + 5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function signIn(page: Page, phone: string, password = PASSWORD) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function headersOf(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.describe("the teaching view and its switch (A-194)", () => {
  test("a teacher who also manages a branch switches between a short teaching view and everything", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, CEO_PHONE);
    await expect(page).toHaveURL(/\/en\/dashboard/);
    // The director holds one side only: no switch.
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await expect(
      page.getByRole("complementary").getByRole("link", { name: "Kampus" }),
    ).toHaveAttribute("href", "/en/dashboard");
    const headers = await headersOf(page);
    const me = (await (await page.request.get("/api/v1/auth/me")).json()) as {
      branches: Array<{ id: string; name: string }>;
    };
    const branchId = me.branches.find((b) => b.name === "Central")!.id;
    const created = await page.request.post("/api/v1/staff", {
      headers,
      data: {
        fullName: NAME,
        phone: PHONE,
        gender: "MALE",
        roleCodes: ["TEACHER", "BRANCH_MANAGER"],
        branchIds: [branchId],
        password: TEMPORARY,
      },
    });
    expect(created.status()).toBe(201);
    const staff = (await created.json()) as { id: string };
    let groupId = "";

    try {
      const them = await (await browser.newContext()).newPage();
      await signIn(them, PHONE, TEMPORARY);
      await expect(them).toHaveURL(/\/en\/change-password/);
      const form = them.getByTestId("password-form");
      await form.getByLabel("Current password").fill(TEMPORARY);
      await form.getByLabel("New password", { exact: true }).fill(OWN);
      await form.getByLabel("Repeat the new password").fill(OWN);
      await form.getByRole("button", { name: "Save the password" }).click();

      // Until they choose, they see everything, and a note points at the switch.
      await expect(them).toHaveURL(/\/en\/dashboard/);
      const teacherSide = them.getByRole("radio", { name: "Teacher" });
      const managerSide = them.getByRole("radio", { name: "Branch manager" });
      await expect(managerSide).toBeChecked();
      await expect(them.getByTestId("view-hint")).toContainText("New: the Teacher view");
      await expect(mainNav(them).getByRole("link", { name: "Finance" })).toBeVisible();

      // The teaching side: four pages, the rest folded, and Today on top.
      await teacherSide.click();
      await expect(them).toHaveURL(/\/en\/today/);
      await expect(teacherSide).toBeChecked();
      await expect(them.getByTestId("view-hint")).toHaveCount(0);
      const nav = mainNav(them);
      for (const name of ["Today", "Checking", "Groups", "Students"]) {
        await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
      }
      for (const name of ["Home", "Finance", "Leads", "Cash desk", "Settings", "Timetable"]) {
        await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
      }
      await expect(them.getByRole("button", { name: "Payment" })).toHaveCount(0);
      await nav.getByTestId("nav-more").click();
      await expect(nav.getByRole("link", { name: "Timetable", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Finance", exact: true })).toHaveCount(0);
      // The logo leads to the view's own first page.
      await expect(
        them.getByRole("complementary").getByRole("link", { name: "Kampus" }),
      ).toHaveAttribute("href", "/en/today");

      // Nobody made them the teacher of a group yet: the desk says what to do.
      await expect(them.getByTestId("desk-empty")).toContainText(
        "No group has you as its teacher yet",
      );
      await expect(them.getByTestId("desk-empty")).toContainText("Switch to Branch manager");

      // The office gives them a group with a lesson late every evening and one student.
      const courses = (await (
        await page.request.get(`/api/v1/courses?branchId=${branchId}&pageSize=100`, { headers })
      ).json()) as { items: Array<{ id: string; name: string }> };
      const courseId = courses.items.find((c) => c.name === "IELTS Preparation")!.id;
      const group = await page.request.post("/api/v1/groups", {
        headers,
        data: {
          branchId,
          name: `E2E Desk ${STAMP}`,
          courseId,
          gradingSystemId: null,
          weekdayPattern: "CUSTOM",
          slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            startTime: "23:40",
            endTime: "23:59",
            roomId: null,
          })),
          teachers: [{ userId: staff.id, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
          startDate: tashkent(-7),
          endDate: null,
          status: "ACTIVE",
        },
      });
      expect(group.status()).toBe(201);
      groupId = ((await group.json()) as { id: string }).id;
      const student = await page.request.post("/api/v1/students", {
        headers,
        data: {
          branchId,
          fullName: `E2E Dovud ${STAMP}`,
          phone: STUDENT_PHONE,
          birthDate: null,
          gender: "MALE",
          photoUrl: null,
          password: null,
          sourceId: null,
          schoolId: null,
          note: null,
          membership: {
            groupId,
            joinedAt: tashkent(-7),
            customPrice: null,
            note: null,
            status: "ACTIVE",
          },
        },
      });
      expect(student.status()).toBe(201);

      await them.reload();
      const hero = them.getByTestId("today-next-lesson");
      await expect(hero).toContainText("23:40");
      await expect(hero.getByTestId("desk-group")).toHaveText(`E2E Desk ${STAMP}`);
      await expect(hero).toContainText(`E2E Dovud ${STAMP}`);
      await expect(hero.getByTestId("desk-video-start")).toBeVisible();
      await expect(them.getByTestId("desk-checking")).toContainText("Nothing is waiting");
      await expect(them.getByTestId("desk-coming-up")).toContainText(`E2E Desk ${STAMP}`);
      await expect(them.getByTestId("desk-student")).toContainText(`E2E Dovud ${STAMP}`);
      // Their own group only, though the branch has others.
      await them.goto("/en/groups");
      await expect(them.getByTestId("group-row")).toHaveCount(1);

      // The server narrows too: what the manager may do is refused in the teaching view.
      const theirHeaders = await headersOf(them);
      expect((await them.request.get("/api/v1/staff", { headers: theirHeaders })).status()).toBe(
        403,
      );

      // A manager's page says which side it belongs to, and the button there changes sides in place.
      await them.goto("/en/finance");
      await expect(them.getByTestId("forbidden-in-view")).toContainText("Branch manager");
      await them.getByTestId("switch-view").click();
      await expect(them.getByTestId("forbidden-in-view")).toHaveCount(0);
      await expect(them).toHaveURL(/\/en\/finance/);
      await expect(managerSide).toBeChecked();
      await expect(mainNav(them).getByRole("link", { name: "Finance" })).toBeVisible();
      expect((await them.request.get("/api/v1/staff", { headers: theirHeaders })).status()).toBe(
        200,
      );
      // As the manager they see the branch's other groups again.
      await them.goto("/en/groups");
      await expect(them.getByTestId("group-row").nth(1)).toBeVisible();

      // The choice is kept on the account: another device opens on the teaching side.
      await teacherSide.click();
      await expect(them).toHaveURL(/\/en\/today/);
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pocket = await phone.newPage();
      await signIn(pocket, PHONE, OWN);
      await expect(pocket).toHaveURL(/\/en\/today/);
      await expect(pocket.getByRole("radio", { name: "Teacher" })).toBeChecked();
      // On a phone the four pages sit along the bottom.
      const bar = pocket.getByTestId("teaching-tab-bar");
      await expect(bar.getByRole("link", { name: "Checking" })).toBeVisible();
      await bar.getByRole("link", { name: "Students" }).click();
      await expect(pocket).toHaveURL(/\/en\/students/);
      await phone.close();
      await them.context().close();
    } finally {
      if (groupId) {
        await page.request.patch(`/api/v1/groups/${groupId}`, {
          headers,
          data: { status: "ARCHIVED" },
        });
      }
      await page.request.delete(`/api/v1/staff/${staff.id}`, { headers });
    }
  });

  test("a teacher has the short menu and no switch", async ({ page }) => {
    await signIn(page, TEACHER_PHONE);
    await expect(page).toHaveURL(/\/en\/today/);
    await expect(page.getByTestId("view-switch")).toHaveCount(0);
    await expect(page.getByTestId("teaching-desk")).toBeVisible();
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Today", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Timetable", exact: true })).toHaveCount(0);
    await nav.getByTestId("nav-more").click();
    await nav.getByRole("link", { name: "Timetable", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/timetable/);
    // "More" stays open while the page under it is the one in view.
    await expect(nav.getByRole("link", { name: "Exams", exact: true })).toBeVisible();
    // The switch's address is not for people with one side.
    const cookies = await page.context().cookies();
    const refused = await page.request.post("/api/v1/auth/view", {
      headers: {
        "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
        "content-type": "application/json",
      },
      data: { view: "FULL" },
    });
    expect(refused.status()).toBe(403);
  });
});
