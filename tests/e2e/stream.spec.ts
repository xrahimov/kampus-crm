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

test.describe("class stream (A-164)", () => {
  test("the teacher posts, the student comments from their link, the teacher closes comments", async ({
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

    await teacher.getByTestId("tab-stream").click();
    const feed = teacher.getByTestId("group-stream");
    await feed.getByTestId("stream-body").fill(`Bring your books ${stamp}`);
    await feed.getByTestId("stream-pinned").click();
    await feed.getByTestId("stream-send").click();
    const post = feed.getByTestId("stream-post").filter({ hasText: `Bring your books ${stamp}` });
    await expect(post).toBeVisible();
    await expect(post).toHaveAttribute("data-pinned", "true");
    await expect(post.getByTestId("stream-pinned-badge")).toBeVisible();

    // The student reads it on their page and answers.
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-stream").click();
    const theirs = student
      .getByTestId("portal-stream")
      .getByTestId("stream-post")
      .filter({ hasText: `Bring your books ${stamp}` });
    await expect(theirs).toBeVisible();
    await theirs.getByTestId("stream-comment-input").fill("Which chapter?");
    await theirs.getByTestId("stream-comment-send").click();
    const comment = theirs.getByTestId("stream-comment").filter({ hasText: "Which chapter?" });
    await expect(comment).toBeVisible();
    await expect(comment).toContainText(first!.fullName);
    await expect(comment.getByTestId("stream-comment-delete")).toBeVisible();

    // The teacher answers and closes comments; the student sees the note.
    await teacher.reload();
    await teacher.getByTestId("tab-stream").click();
    await expect(
      post.getByTestId("stream-comment").filter({ hasText: "Which chapter?" }),
    ).toBeVisible();
    await post.getByTestId("stream-comment-input").fill("Chapter 3.");
    await post.getByTestId("stream-comment-send").click();
    await expect(
      post.getByTestId("stream-comment").filter({ hasText: "Chapter 3." }),
    ).toBeVisible();
    await post.getByTestId("stream-lock").click();
    await expect(post.getByTestId("stream-locked-badge")).toBeVisible();

    await student.reload();
    await student.getByTestId("portal-tab-stream").click();
    await expect(theirs.getByTestId("stream-locked-note")).toBeVisible();
    await expect(theirs.getByTestId("stream-comment-input")).toHaveCount(0);

    // Clean up: delete the post.
    await post.getByTestId("stream-delete").click();
    await teacher.getByRole("button", { name: "Delete" }).click();
    await expect(post).toHaveCount(0);
  });
});
