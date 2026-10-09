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
/** The calendar day in Tashkent (UTC+5), which is what Today shows. */
const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Grid = {
  lessons: Array<{ id: string; date: string; startTime: string }>;
  members: Array<{ membershipId: string; studentId: string }>;
};

test.describe("course syllabus (A-137)", () => {
  test("the office writes a syllabus, lessons take its topics and the group shows the progress", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const today = todayTashkent();
    const tag = `E2E Syllabus ${STAMP}`;

    // A course of its own, a group meeting every day since last week and one student.
    const demo = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ name: string; branchId: string }> };
    const branchId = demo.items.find((g) => g.name === "GE-Morning A1")!.branchId;
    const course = await page.request.post("/api/v1/courses", {
      headers,
      data: { branchId, name: tag, price: 100000, durationMonths: 2, gradingSystemId: null },
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
          startTime: "06:00",
          endTime: "06:45",
          roomId: null,
        })),
        teachers: [],
        startDate: shift(today, -7),
        endDate: null,
        status: "ACTIVE",
      },
    });
    expect(group.status()).toBe(201);
    const groupId = ((await group.json()) as { id: string }).id;
    const student = await page.request.post("/api/v1/students", {
      headers,
      data: {
        branchId,
        fullName: `${tag} Student`,
        phone: `+99893${STAMP.slice(-7)}`,
        gender: "FEMALE",
        membership: {
          groupId,
          joinedAt: shift(today, -7),
          customPrice: null,
          note: null,
          status: "ACTIVE",
        },
      },
    });
    expect(student.status()).toBe(201);

    // The syllabus is written from the course's row menu.
    await page.goto(`/en/settings/courses?q=${encodeURIComponent(tag)}`);
    const row = page.getByRole("row", { name: new RegExp(tag) }).first();
    await row.getByRole("button", { name: `Actions for ${tag}` }).click();
    await page.getByTestId("course-syllabus").click();
    const dialog = page.getByTestId("syllabus-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("syllabus-text")).toBeEnabled();
    await page.getByTestId("syllabus-text").fill("Alphabet\nGreetings\nNumbers\n");
    await expect(page.getByTestId("syllabus-count")).toHaveText("3 topics");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // The group's Syllabus tab: nothing covered yet, Alphabet next.
    await page.goto(`/en/groups/${groupId}?tab=syllabus`);
    await expect(page.getByTestId("syllabus-progress")).toHaveText("0 of 3 topics covered");
    await expect(page.getByTestId("syllabus-next")).toContainText("Alphabet");
    await expect(page.getByTestId("syllabus-topic")).toHaveCount(3);

    // Marking attendance on a past lesson gives it the first topic.
    const grid = (await (
      await page.request.get(`/api/v1/groups/${groupId}/lessons?month=${today.slice(0, 7)}`, {
        headers,
      })
    ).json()) as Grid;
    const past = grid.lessons
      .filter((l) => l.date < today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const membershipId = grid.members[0]!.membershipId;
    const marked = await page.request.put(`/api/v1/lessons/${past[0]!.id}/attendance`, {
      headers,
      data: { marks: [{ membershipId, status: "PRESENT" }] },
    });
    expect(marked.status()).toBe(204);
    await page.reload();
    await expect(page.getByTestId("syllabus-progress")).toHaveText("1 of 3 topics covered");
    await expect(page.getByTestId("syllabus-next")).toContainText("Greetings");
    await expect(page.getByTestId("syllabus-topic").first()).toHaveAttribute("data-status", "done");

    // Today offers the next topic on the group's lesson of the day; "Use it" takes it.
    await page.goto("/en/today");
    const card = page.getByTestId("today-lesson").filter({ hasText: tag });
    await expect(card.getByTestId("today-suggested-topic")).toContainText("Greetings");
    await card.getByTestId("today-use-topic").click();
    await expect(card.getByTestId("today-suggested-topic")).toHaveCount(0);
    await expect(card).toContainText("Greetings");

    // The lesson topic dialog in the grid lists the syllabus topics.
    await page.goto(`/en/groups/${groupId}`);
    await page.getByTestId("attendance-grid").locator("button[title*='Alphabet']").click();
    const topicDialog = page.getByTestId("topic-dialog");
    await expect(topicDialog).toBeVisible();
    await expect(topicDialog.getByTestId("course-topic-select")).toHaveValue(/./);
    await expect(topicDialog.getByRole("option", { name: "3. Numbers" })).toBeAttached();

    // Tidy up: the group out of the way of other runs.
    await topicDialog.getByRole("button", { name: "Cancel" }).click();
    await page.request.delete(`/api/v1/groups/${groupId}`, { headers });
  });
});
