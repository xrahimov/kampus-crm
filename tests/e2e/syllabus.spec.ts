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

    // Lesson content on a topic (A-157): the office writes it; the student sees the covered
    // topic open, the next one locked until the teacher opens it now.
    await page.goto(`/en/groups/${groupId}?tab=syllabus`);
    await page.getByTestId("syllabus-content").nth(1).click();
    const content = page.getByTestId("topic-content-dialog");
    await expect(content).toBeVisible();
    await expect(content.getByTestId("topic-content-empty")).toBeVisible();
    await content.getByTestId("tc-title").fill("Read first");
    await content.getByTestId("tc-body").fill("Hello and goodbye.");
    await content.getByTestId("tc-add").click();
    await content.getByTestId("tc-kind").click();
    await page.getByRole("option", { name: "Video" }).click();
    await content.getByTestId("tc-title").fill("Watch");
    await content.getByTestId("tc-url").fill("https://youtu.be/dQw4w9WgXcQ");
    await content.getByTestId("tc-add").click();
    await expect(content.getByTestId("topic-content-block")).toHaveCount(2);
    await content.getByRole("button", { name: "Save" }).click();
    await expect(content).toBeHidden();
    await expect(page.getByTestId("syllabus-content").nth(1)).toContainText("Content (2)");
    await expect(page.getByTestId("syllabus-open")).toHaveCount(1);

    const links = (await (
      await page.request.get(`/api/v1/groups/${groupId}/video/links`, { headers })
    ).json()) as Array<{ token: string }>;
    const studentPage = await page.context().browser()!.newPage();
    await studentPage.goto(`/en/class/${links[0]!.token}`);
    await studentPage.getByTestId("portal-tab-course").click();
    await expect(studentPage.getByTestId("portal-course-progress")).toContainText("1 of 3");
    const portalTopics = studentPage.getByTestId("portal-topic");
    await expect(portalTopics.nth(0)).toHaveAttribute("data-open", "true");
    await expect(portalTopics.nth(1)).toHaveAttribute("data-open", "false");
    await expect(portalTopics.nth(1)).toContainText("Opens after the lesson");

    await page.getByTestId("syllabus-release").nth(1).click();
    await page.getByRole("option", { name: "Open now" }).click();
    await expect(page.getByTestId("syllabus-open")).toHaveCount(2);
    await studentPage.reload();
    await studentPage.getByTestId("portal-tab-course").click();
    await expect(portalTopics.nth(1)).toHaveAttribute("data-open", "true");
    // The first topic with content unfolds by itself; a click on the summary would fold it.
    const unfold = async () => {
      const details = portalTopics.nth(1).locator("details");
      if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
      await expect(details).toHaveAttribute("open", "");
    };
    await unfold();
    await expect(portalTopics.nth(1).getByTestId("topic-block")).toHaveCount(2);
    await expect(portalTopics.nth(1)).toContainText("Hello and goodbye.");
    await expect(portalTopics.nth(1).getByTestId("topic-youtube")).toHaveAttribute(
      "src",
      /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
    );

    // A self-check exercise on the topic (A-158): the office writes two items, the student does them.
    await page.getByTestId("syllabus-content").nth(1).click();
    await expect(content).toBeVisible();
    await content.getByTestId("exercise-new").click();
    const exercise = page.getByTestId("exercise-dialog");
    await expect(exercise).toBeVisible();
    await exercise.getByTestId("ex-title").fill("Greetings check");
    await exercise.getByTestId("ex-prompt").fill("Which one is a greeting?");
    await exercise.getByTestId("ex-options").fill("Hello\nTable");
    await exercise.getByTestId("ex-correct").getByLabel("Hello").click();
    await exercise.getByTestId("ex-add").click();
    await expect(exercise.getByTestId("ex-item")).toHaveCount(1);
    await exercise.getByTestId("ex-kind").click();
    await page.getByRole("option", { name: "Short answer" }).click();
    await exercise.getByTestId("ex-prompt").fill("Translate: salom");
    await exercise.getByTestId("ex-key").fill("hello\nhi");
    await exercise.getByTestId("ex-add").click();
    await expect(exercise.getByTestId("ex-item")).toHaveCount(2);
    await exercise.getByRole("button", { name: "Save" }).click();
    await expect(exercise).toBeHidden();
    await expect(content.getByTestId("exercise-row")).toHaveCount(1);
    await content.getByRole("button", { name: "Cancel" }).click();
    await expect(content).toBeHidden();

    await studentPage.reload();
    await studentPage.getByTestId("portal-tab-course").click();
    await unfold();
    const practice = portalTopics.nth(1).getByTestId("portal-exercise");
    await expect(practice).toContainText("Greetings check");
    await practice.getByTestId("exercise-start").click();
    const form = practice.getByTestId("exercise-form");
    await form.getByLabel("Hello").click();
    await form.getByTestId("exercise-short").fill(" HELLO ");
    await form.getByTestId("exercise-submit").click();
    await expect(practice.getByTestId("exercise-score")).toHaveText("2 of 2 (100 %)");
    await expect(practice.getByTestId("exercise-item-result")).toHaveCount(2);
    await practice.getByTestId("exercise-done").click();
    await expect(practice.getByTestId("portal-exercise-best")).toContainText("2/2");

    // Progress (A-159): the student sees the course share and the exercise count; Alphabet
    // (attended, nothing asked) is done, Greetings has no lesson yet so it stays open.
    await studentPage.reload();
    await studentPage.getByTestId("portal-tab-course").click();
    const summary = studentPage.getByTestId("portal-progress");
    await expect(summary.getByTestId("portal-progress-percent")).toHaveText(
      "33% of the course complete",
    );
    await expect(summary.getByTestId("portal-progress-exercises")).toHaveText("Exercises: 1 of 1");
    await expect(portalTopics.nth(0).getByTestId("portal-topic-done")).toBeVisible();
    await expect(portalTopics.nth(1).getByTestId("portal-topic-done")).toHaveCount(0);
    await studentPage.close();

    // The teacher sees the result on the exercise.
    await page.getByTestId("syllabus-content").nth(1).click();
    await content.getByTestId("exercise-edit").click();
    await expect(exercise.getByTestId("ex-result-row")).toContainText("2/2 (100 %)");
    await exercise.getByRole("button", { name: "Cancel" }).click();
    await content.getByRole("button", { name: "Cancel" }).click();

    // The teacher's table under the syllabus: one row, one square per topic.
    await page.goto(`/en/groups/${groupId}?tab=syllabus`);
    const progressRow = page.getByTestId("group-progress-row");
    await expect(progressRow).toHaveCount(1);
    await expect(progressRow.getByTestId("group-progress-percent")).toHaveText("33%");
    await expect(progressRow.getByTestId("group-progress-cell")).toHaveCount(3);
    await expect(progressRow.getByTestId("group-progress-cell").nth(0)).toHaveAttribute(
      "data-state",
      "complete",
    );
    await expect(progressRow.getByTestId("group-progress-cell").nth(1)).toHaveAttribute(
      "data-state",
      "planned",
    );

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
