import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = String(Date.now());

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

async function apiHeaders(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Settings = { studentReschedule: boolean; studentRescheduleHours: number };

test.describe("students move their own 1:1 lessons (A-166)", () => {
  test("the CEO switches it on, the student moves and cancels a lesson, staff see the days off", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const today = todayTashkent();
    const tag = `E2E Reschedule ${STAMP}`;

    // The switch and the notice live in Settings → General.
    await page.goto("/en/settings");
    await expect(page.getByTestId("reschedule-settings")).toBeVisible();
    const settings = (await (
      await page.request.get("/api/v1/settings/org", { headers })
    ).json()) as Settings & Record<string, unknown>;
    const saved = await page.request.put("/api/v1/settings/org", {
      headers,
      data: { ...settings, studentReschedule: true, studentRescheduleHours: 3 },
    });
    expect(saved.ok()).toBe(true);

    let teacherId = "";
    let groupId = "";
    try {
      // A 1:1 group meeting every day at 07:00 with its only student, taught by the seeded teacher,
      // who is open for booking every afternoon (A-169).
      const demo = (await (
        await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
      ).json()) as { items: Array<{ name: string; branchId: string }> };
      const branchId = demo.items.find((g) => g.name === "GE-Morning A1")!.branchId;
      const teachers = (await (
        await page.request.get("/api/v1/teachers?tab=teachers&q=%2B998900000004", { headers })
      ).json()) as { items: Array<{ id: string; phone: string }> };
      teacherId = teachers.items.find((t) => t.phone === "+998900000004")!.id;
      const hours = await page.request.put(`/api/v1/teachers/${teacherId}/availability`, {
        headers,
        data: {
          windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            startTime: "14:00",
            endTime: "16:00",
          })),
        },
      });
      expect(hours.ok()).toBe(true);
      const course = await page.request.post("/api/v1/courses", {
        headers,
        data: { branchId, name: tag, price: 100000, durationMonths: 1, gradingSystemId: null },
      });
      expect(course.status()).toBe(201);
      const courseId = ((await course.json()) as { id: string }).id;
      const group = await page.request.post("/api/v1/groups", {
        headers,
        data: {
          branchId,
          name: tag,
          courseId,
          gradingSystemId: null,
          weekdayPattern: "CUSTOM",
          slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
            weekday,
            startTime: "07:00",
            endTime: "07:45",
            roomId: null,
          })),
          teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
          // An earlier run's group may still meet at 07:00 with the same teacher.
          ignoreClashes: true,
          startDate: today,
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
          fullName: `${tag} Student`,
          phone: `+99892${STAMP.slice(-7)}`,
          gender: "MALE",
          membership: { groupId, joinedAt: today, customPrice: null, note: null, status: "ACTIVE" },
        },
      });
      expect(student.status()).toBe(201);
      const links = (await (
        await page.request.get(`/api/v1/groups/${groupId}/video/links`, { headers })
      ).json()) as Array<{ token: string }>;

      // The student's Schedule tab lists the next lessons with the rule.
      const studentPage = await page.context().browser()!.newPage();
      await studentPage.goto(`/en/class/${links[0]!.token}`);
      await studentPage.getByRole("tab", { name: "Schedule" }).click();
      await expect(studentPage.getByTestId("portal-reschedule-rule")).toContainText("3 hours");
      const lessonOn = (date: string) =>
        studentPage.locator(`[data-testid="portal-upcoming-lesson"][data-date="${date}"]`);
      const inTwoDays = lessonOn(shift(today, 2));
      await inTwoDays.getByTestId("portal-move").click();
      const picker = studentPage.getByTestId("portal-pick-time");
      await picker.getByTestId("pick-date").fill(shift(today, 2));
      await picker.getByTestId("pick-time").fill("15:00");
      await expect(picker.getByTestId("pick-end")).toHaveText("15:45");
      await picker.getByTestId("pick-save").click();
      await expect(picker).toBeHidden();
      await expect(lessonOn(shift(today, 2))).toContainText("15:00–15:45");

      // Booking an extra lesson from the teacher's free afternoons (A-169).
      await expect(studentPage.getByTestId("portal-booking")).toContainText("2 more");
      const slot = studentPage.getByTestId("portal-book-slot").first();
      const slotDate = (await slot.getAttribute("data-date"))!;
      const slotTime = (await slot.getAttribute("data-time"))!;
      expect(slotTime >= "14:00" && slotTime < "16:00").toBe(true);
      await slot.click();
      await expect(
        studentPage.locator(`[data-testid="portal-upcoming-lesson"][data-date="${slotDate}"]`, {
          hasText: slotTime,
        }),
      ).toBeVisible();
      await expect(studentPage.getByTestId("portal-booking")).toContainText("1 more");

      // Cancelling leaves the lesson waiting for a new time.
      await lessonOn(shift(today, 3)).getByTestId("portal-cancel").click();
      await expect(lessonOn(shift(today, 3))).toHaveCount(0);
      await expect(studentPage.getByTestId("portal-cancelled-lesson")).toHaveCount(1);
      await expect(studentPage.getByTestId("portal-cancelled-lesson")).toContainText(
        "cancelled by you",
      );
      await studentPage.close();

      // Staff see both as days off of the group, worded as the student's.
      await page.goto(`/en/groups/${groupId}`);
      const daysOff = page.getByTestId("group-days-off");
      await expect(daysOff).toContainText("Moved by the student");
      await expect(daysOff).toContainText("Cancelled by the student");

      // The teacher's page shows the booking hours the office set.
      await page.goto(`/en/teachers/${teacherId}`);
      await expect(
        page.getByTestId("availability-day-1").getByTestId("availability-start"),
      ).toHaveValue("14:00");
    } finally {
      // Archived, so the teacher's 07:00 is free for the next run.
      if (groupId) await page.request.delete(`/api/v1/groups/${groupId}`, { headers });
      if (teacherId) {
        await page.request.put(`/api/v1/teachers/${teacherId}/availability`, {
          headers,
          data: { windows: [] },
        });
      }
      await page.request.put("/api/v1/settings/org", {
        headers,
        data: {
          ...settings,
          studentReschedule: settings.studentReschedule,
          studentRescheduleHours: settings.studentRescheduleHours,
        },
      });
    }
  });
});
