import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("assignments (A-161)", () => {
  test("a teacher sets an assignment with a rubric, the student answers, the review scores it", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const stamp = Date.now();
    const teacher = await (await browser.newContext()).newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;

    // The assignment: a name, the task, a due date and two rubric lines.
    await teacher.getByTestId("tab-homework").click();
    await teacher.getByTestId("assignment-add").click();
    const dialog = teacher.getByTestId("assignment-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("as-title").fill(`Essay ${stamp}`);
    await dialog.getByTestId("as-text").fill("Write 200 words about your city.");
    await dialog.getByTestId("as-due").fill("2030-01-15");
    await dialog.getByTestId("as-criterion-add").click();
    await dialog.getByTestId("as-criterion-name").nth(0).fill("Content");
    await dialog.getByTestId("as-criterion-add").click();
    await dialog.getByTestId("as-criterion-name").nth(1).fill("Grammar");
    await dialog.getByTestId("as-criterion-max").nth(1).fill("5");
    await expect(dialog.getByTestId("as-rubric-total")).toHaveText("15 points in all");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const card = teacher.getByTestId("homework-card").filter({ hasText: `Essay ${stamp}` });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-kind", "assignment");
    await expect(card.getByTestId("assignment-badge")).toBeVisible();
    await expect(card.getByTestId("rubric-list")).toContainText("Grammar");
    await expect(card).toContainText("out of 15 points");

    // The student sees the rubric and answers.
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-homework").click();
    const item = student.getByTestId("portal-homework-item").filter({ hasText: `Essay ${stamp}` });
    await expect(item).toBeVisible();
    await expect(item.getByTestId("portal-assignment-badge")).toBeVisible();
    await expect(item.getByTestId("portal-rubric")).toContainText("15 points");
    await item.getByTestId("hw-answer").click();
    await item.getByTestId("hw-note").fill("My city is Tashkent. It is big and green.");
    await item.getByTestId("hw-send").click();
    await expect(item).toContainText("Sent");

    // The teacher scores each criterion while accepting; the student sees the points.
    await teacher.reload();
    await teacher.getByTestId("tab-homework").click();
    const row = card.getByTestId("homework-row").filter({ hasText: first!.fullName });
    await row.getByTestId("homework-accept").click();
    const review = teacher.getByTestId("review-dialog");
    await expect(review.getByTestId("review-rubric")).toContainText("Score: 0 of 15");
    await review.getByTestId("review-points").nth(0).fill("8");
    await review.getByTestId("review-points").nth(1).fill("4");
    await expect(review.getByTestId("review-rubric")).toContainText("Score: 12 of 15");
    await review.getByRole("button", { name: "Accept" }).click();
    await expect(review).toBeHidden();
    await expect(row).toContainText("Accepted");
    await expect(row.getByTestId("hw-row-score")).toHaveText("12/15");

    await student.reload();
    await student.getByTestId("portal-tab-homework").click();
    await expect(item).toContainText("Accepted");
    await expect(item.getByTestId("portal-score")).toHaveText("Your score: 12 of 15");
    await expect(item.getByTestId("portal-rubric")).toContainText("8 / 10");

    // Tidy up.
    await card.getByRole("button", { name: "Delete" }).click();
    await teacher.getByRole("button", { name: "Delete" }).last().click();
    await expect(card).toBeHidden();
  });
});
