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

test.describe("group chat", () => {
  test("a teacher writes to the group, the student reads and answers from their link", async ({
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

    // The teacher's message, sent with Enter.
    await teacher.getByTestId("tab-chat").click();
    const input = teacher.getByTestId("group-chat-input");
    await input.fill(`Bring your books ${stamp}`);
    await input.press("Enter");
    const mine = teacher
      .getByTestId("group-chat-message")
      .filter({ hasText: `Bring your books ${stamp}` });
    await expect(mine).toBeVisible();
    await expect(mine).toHaveAttribute("data-mine", "true");
    await expect(mine).toContainText("You");

    // The student sees it unread on their page and answers.
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("portal-chat-unread")).toBeVisible();
    await student.getByTestId("portal-tab-chat").click();
    await expect(student.getByTestId("portal-chat-teachers")).toContainText("Teachers:");
    const theirs = student
      .getByTestId("portal-chat-message")
      .filter({ hasText: `Bring your books ${stamp}` });
    await expect(theirs).toBeVisible();
    await expect(theirs).toHaveAttribute("data-mine", "false");
    await student.getByTestId("portal-chat-input").fill(`Which pages? ${stamp}`);
    await student.getByTestId("portal-chat-send").click();
    const answer = student
      .getByTestId("portal-chat-message")
      .filter({ hasText: `Which pages? ${stamp}` });
    await expect(answer).toHaveAttribute("data-mine", "true");

    // Opening the chat read it: the badge is gone on the next load.
    await student.reload();
    await expect(student.getByTestId("portal-chat-unread")).toHaveCount(0);

    // The teacher sees the answer under the student's name.
    await teacher.goto(`/en/groups/${groupId}?tab=chat`);
    const seen = teacher
      .getByTestId("group-chat-message")
      .filter({ hasText: `Which pages? ${stamp}` });
    await expect(seen).toBeVisible();
    await expect(seen).toContainText(first!.fullName);
    await expect(seen).toHaveAttribute("data-mine", "false");
  });
});
