import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

// Fake camera and microphone so the teacher can record a short call.
test.use({
  permissions: ["camera", "microphone"],
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups)/);
}

test.describe("lesson materials", () => {
  test("a teacher adds a link, records a call, and the student sees both", async ({ browser }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;

    // A link for the whole group.
    await teacher.getByTestId("tab-materials").click();
    await teacher.getByTestId("material-add").click();
    const dialog = teacher.getByTestId("material-dialog");
    await dialog.getByTestId("mt-kind").click();
    await teacher.getByRole("option", { name: "Link" }).click();
    await dialog.getByTestId("mt-title").fill(`Grammar video ${stamp}`);
    await dialog.getByTestId("mt-url").fill("https://example.com/grammar");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = teacher.getByTestId("material-row").filter({ hasText: `Grammar video ${stamp}` });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Link");

    // Record a few seconds of a call.
    const card = teacher.getByTestId("group-video");
    if (await card.getByTestId("video-start").isVisible()) {
      await card.getByTestId("video-start").click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();
    await teacher.getByTestId("toggle-record").click();
    await expect(teacher.getByTestId("recording-notice")).toContainText("Recording");
    await teacher.waitForTimeout(6000);
    await teacher.getByTestId("toggle-record").click();
    await expect(teacher.getByTestId("recording-notice")).toContainText("The recording is saved", {
      timeout: 30_000,
    });
    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toBeVisible();

    await teacher.goto(`/en/groups/${groupId}`);
    await teacher.getByTestId("tab-materials").click();
    const recording = teacher.getByTestId("material-row").filter({ hasText: "Recording" }).first();
    await expect(recording).toBeVisible();
    await expect(recording.getByTestId("material-video")).toBeVisible();

    // The student sees the link and can play the recording from their page.
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-materials").click();
    await expect(
      student.getByTestId("portal-material").filter({ hasText: `Grammar video ${stamp}` }),
    ).toBeVisible();
    const video = student.getByTestId("portal-recording").first();
    await expect(video).toBeVisible();
    const src = await video.getAttribute("src");
    expect(src).toMatch(/^\/api\/v1\/public\/class\/.+\/files\/recordings\/[a-f0-9]{32}\.webm$/);
    const head = await student.request.get(src!, { headers: { Range: "bytes=0-99" } });
    expect(head.status()).toBe(206);
    expect(head.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);

    // Clean up: the link and the recording go.
    for (const title of [`Grammar video ${stamp}`]) {
      const r = teacher.getByTestId("material-row").filter({ hasText: title });
      await r.getByTestId("material-delete").click();
      await teacher.getByRole("button", { name: "Delete" }).last().click();
      await expect(r).toBeHidden();
    }
    await recording.getByTestId("material-delete").click();
    await teacher.getByRole("button", { name: "Delete" }).last().click();
    await expect(teacher.getByTestId("material-row").filter({ hasText: "Recording" })).toHaveCount(
      0,
    );
  });
});
