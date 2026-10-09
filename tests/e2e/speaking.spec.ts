import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

// A tiny WebM/Opus header is enough for the upload: the server checks type and size, not content.
const WEBM = Buffer.from(
  "1a45dfa3010000000000001f4286810142f7810142f2810442f381084282847765626d",
  "hex",
);

test.describe("speaking homework (A-141)", () => {
  test("a speaking task shows the recorder, takes an audio answer and plays it to the teacher", async ({
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

    await teacher.getByTestId("tab-homework").click();
    await teacher.getByTestId("homework-add").click();
    const dialog = teacher.getByTestId("homework-dialog");
    await dialog.getByTestId("hw-lesson").click();
    await teacher.getByRole("option").filter({ hasNotText: "has homework" }).first().click();
    await dialog.getByTestId("hw-text").fill(`Say hello ${stamp}`);
    await dialog.getByTestId("hw-speaking").click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const card = teacher.getByTestId("homework-card").filter({ hasText: `Say hello ${stamp}` });
    await expect(card.getByTestId("hw-speaking-badge")).toBeVisible();

    // The student sees the speaking badge and the recorder; an audio file works too.
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-homework").click();
    const item = student
      .getByTestId("portal-homework-item")
      .filter({ hasText: `Say hello ${stamp}` });
    await expect(item.getByTestId("portal-hw-speaking")).toBeVisible();
    await item.getByTestId("hw-answer").click();
    await expect(item.getByTestId("hw-recorder-start")).toBeVisible();
    await item
      .locator("input[type=file]")
      .setInputFiles({ name: "answer.webm", mimeType: "audio/webm", buffer: WEBM });
    await item.getByTestId("hw-send").click();
    await expect(item).toContainText("Sent");
    await expect(item.getByTestId("portal-hw-audio").locator("audio")).toHaveCount(1);

    // The teacher hears it in the row and in the review dialog, where a voice reply can be recorded.
    await teacher.reload();
    await teacher.getByTestId("tab-homework").click();
    const row = card.getByTestId("homework-row").filter({ hasText: first!.fullName });
    await expect(row.getByTestId("hw-row-audio").locator("audio")).toHaveCount(1);
    await row.getByTestId("homework-accept").click();
    const review = teacher.getByTestId("review-dialog");
    await expect(review.getByTestId("review-audio").locator("audio")).toHaveCount(1);
    await expect(review.getByTestId("reply-recorder-start")).toBeVisible();
    await review.getByRole("button", { name: "Accept" }).click();
    await expect(row).toContainText("Accepted");

    await card.getByRole("button", { name: "Delete" }).click();
    await teacher.getByRole("button", { name: "Delete" }).last().click();
    await expect(card).toBeHidden();
    await student.context().close();
    await teacherContext.close();
  });
});
