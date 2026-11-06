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

const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const previousMonth = (month: string) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

type Grid = { lessons: Array<{ id: string; date: string; startTime: string }> };

test.describe("lesson note and rating (A-168)", () => {
  test("the teacher's note reaches the student, who rates the lesson; staff see the stars", async ({
    page,
    browser,
  }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const today = todayTashkent();
    const note = `Review unit 3 ${STAMP}`;

    // A past lesson of the seeded group, this month or last.
    const demo = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ id: string; name: string }> };
    const groupId = demo.items.find((g) => g.name === "GE-Morning A1")!.id;
    let month = today.slice(0, 7);
    let past: Grid["lessons"] = [];
    for (let i = 0; i < 2 && past.length === 0; i++) {
      const grid = (await (
        await page.request.get(`/api/v1/groups/${groupId}/lessons?month=${month}`, { headers })
      ).json()) as Grid;
      past = grid.lessons
        .filter((l) => l.date < today)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (past.length === 0) month = previousMonth(month);
    }
    const lesson = past[0]!;
    const saved = await page.request.patch(`/api/v1/lessons/${lesson.id}`, {
      headers,
      data: { studentNote: note },
    });
    expect(saved.status()).toBe(204);

    // The student sees the note under the lesson and rates it.
    const links = (await (
      await page.request.get(`/api/v1/groups/${groupId}/video/links`, { headers })
    ).json()) as Array<{ token: string; membershipId: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${links[0]!.token}`);
    const row = student.getByRole("row").filter({ hasText: note });
    await expect(row.getByTestId("portal-lesson-note")).toContainText(note);
    await row.getByTestId("portal-rate-4").click();
    await expect(row.getByTestId("portal-rate-4")).toHaveAttribute("aria-checked", "true");
    // A first rating opens the line by itself; a repeated run finds the "Add a line" link instead.
    const commentBox = row.getByTestId("portal-rate-comment");
    const openLink = row.getByTestId("portal-rate-comment-open");
    await expect(commentBox.or(openLink)).toBeVisible();
    if (await openLink.isVisible()) await openLink.click();
    await commentBox.fill("Great lesson");
    await row.getByTestId("portal-rate-send").click();
    await expect(row.getByTestId("portal-rate-comment-text")).toHaveText("Great lesson");
    await student.close();

    // Staff: the average beside the date and the student's line in the dialog.
    await page.goto(`/en/groups/${groupId}?month=${month}`);
    const header = page
      .getByTestId("attendance-grid")
      .locator("thead button")
      .filter({ has: page.getByTestId("lesson-rating-avg") })
      .first();
    await expect(header.getByTestId("lesson-rating-avg")).toContainText("★");
    await header.click();
    const dialog = page.getByTestId("topic-dialog");
    await expect(dialog.getByTestId("lesson-student-note")).toHaveValue(note);
    await expect(dialog.getByTestId("lesson-rating-row").first()).toContainText("Great lesson");
    await dialog.getByTestId("lesson-student-note").fill("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  });
});
