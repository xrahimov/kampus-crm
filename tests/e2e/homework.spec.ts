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

test.describe("homework", () => {
  test("a teacher sets homework, the student answers from their link, the teacher accepts", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const stamp = Date.now();
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;

    // Set a task for the first lesson without homework.
    await teacher.getByTestId("tab-homework").click();
    await teacher.getByTestId("homework-add").click();
    const dialog = teacher.getByTestId("homework-dialog");
    await dialog.getByTestId("hw-lesson").click();
    const option = teacher.getByRole("option").filter({ hasNotText: "has homework" }).first();
    const lessonLabel = (await option.textContent())!.trim();
    await option.click();
    await dialog.getByTestId("hw-text").fill(`Read page ${stamp}`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const card = teacher.getByTestId("homework-card").filter({ hasText: `Read page ${stamp}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText("0 of");

    // The student sees it on their page and answers.
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-homework").click();
    const item = student
      .getByTestId("portal-homework-item")
      .filter({ hasText: `Read page ${stamp}` });
    await expect(item).toBeVisible();
    await expect(item).toContainText("To do");
    await item.getByTestId("hw-answer").click();
    await item.getByTestId("hw-note").fill("Done, it was about greetings.");
    await item.getByTestId("hw-send").click();
    await expect(item).toContainText("Sent");
    await expect(item).toContainText("Done, it was about greetings.");

    // The answer waits in the teacher's checking queue (A-160); the keyboard accepts it.
    await teacher.goto("/en/checking");
    const queued = teacher
      .getByTestId("checking-item")
      .filter({ hasText: `Read page ${stamp}` })
      .filter({ hasText: first!.fullName });
    await expect(queued).toBeVisible();
    await expect(queued.getByTestId("checking-answer")).toContainText(
      "Done, it was about greetings.",
    );
    await expect(teacher.getByTestId("nav-checking-count").first()).toBeVisible();
    await queued.click();
    await expect(queued).toHaveAttribute("data-selected", "true");
    await teacher.keyboard.press("a");
    await expect(queued).toHaveCount(0);
    await expect(teacher.getByTestId("checking-summary")).toContainText("1 checked");

    // The group page shows the verdict.
    await teacher.goto(`/en/groups/${groupId}?tab=homework`);
    const row = card.getByTestId("homework-row").filter({ hasText: first!.fullName });
    await expect(row).toContainText("Accepted");
    await expect(card).toContainText("1 of");

    await student.reload();
    await student.getByTestId("portal-tab-homework").click();
    await expect(item).toContainText("Accepted");
    await expect(item.getByTestId("hw-answer")).toHaveCount(0);

    // Clean up so the lesson is free for the next run.
    await card.getByRole("button", { name: "Delete" }).click();
    await teacher.getByRole("button", { name: "Delete" }).last().click();
    await expect(card).toBeHidden();
    expect(lessonLabel.length).toBeGreaterThan(0);
  });
});
