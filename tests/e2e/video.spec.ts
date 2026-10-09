import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

// Chromium's fake camera and microphone, no permission prompt, and plain host
// candidates (no mDNS) so two browsers on one machine can connect without STUN.
test.use({
  permissions: ["camera", "microphone"],
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  },
});

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("video lessons", () => {
  test("a teacher starts a group's call and a student joins from their link", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;

    const card = teacher.getByTestId("group-video");
    await expect(card).toContainText("Video lesson");
    // A call left open by an earlier run is joined instead of started.
    if (await card.getByTestId("video-start").isVisible()) {
      await card.getByTestId("video-start").click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher).toHaveURL(/\/en\/video\/[a-z0-9]+/);
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();
    await expect(teacher.getByTestId("tile-self")).toBeVisible();

    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    expect(links.ok()).toBe(true);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    expect(first).toBeTruthy();

    // The student has no account: just the personal link.
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("class-title")).toHaveText(`Hello, ${first!.fullName}`);
    await expect(student.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await student.getByTestId("join-call").click();
    await expect(student.getByTestId("call-room")).toBeVisible();

    // Both browsers see each other and the connection comes up.
    for (const page of [teacher, student]) {
      await expect(page.getByTestId("call-count")).toHaveText("2 people in the lesson", {
        timeout: 20_000,
      });
      const peer = page.getByTestId("tile-peer");
      await expect(peer).toHaveCount(1);
      await expect(peer).not.toContainText("Connecting", { timeout: 30_000 });
      await expect(peer).not.toContainText("Could not connect");
    }
    await expect(student.getByTestId("tile-peer")).toContainText("Demo Teacher");

    // Muting shows on the other side.
    await student.getByTestId("toggle-mic").click();
    await expect(teacher.getByTestId("tile-peer").getByLabel("Microphone off")).toBeVisible({
      timeout: 10_000,
    });

    // A raised hand shows on the teacher's screen.
    await student.getByTestId("toggle-mic").click();
    await student.getByTestId("toggle-hand").click();
    await expect(teacher.getByTestId("tile-peer").getByTestId("hand-mark")).toBeVisible({
      timeout: 10_000,
    });

    // Chat goes both ways; the student sees an unread badge first.
    await teacher.getByTestId("toggle-chat").click();
    await teacher.getByTestId("chat-input").fill("Open page 12");
    await teacher.getByTestId("chat-send").click();
    await expect(teacher.getByTestId("chat-message")).toContainText("Open page 12");
    await expect(student.getByTestId("chat-unread")).toHaveText("1", { timeout: 10_000 });
    await student.getByTestId("toggle-chat").click();
    await expect(student.getByTestId("chat-message")).toContainText("Open page 12");
    await expect(student.getByTestId("chat-unread")).toHaveCount(0);
    await student.getByTestId("chat-input").fill("Done");
    await student.getByTestId("chat-input").press("Enter");
    await expect(teacher.getByTestId("chat-message")).toHaveCount(2, { timeout: 10_000 });

    // The teacher switches everyone's microphone off.
    await expect(student.getByTestId("toggle-mic")).toHaveAttribute(
      "aria-label",
      "Turn microphone off",
    );
    await teacher.getByTestId("mute-all").click();
    await expect(student.getByTestId("muted-notice")).toContainText("Demo Teacher", {
      timeout: 10_000,
    });
    await expect(student.getByTestId("toggle-mic")).toHaveAttribute(
      "aria-label",
      "Turn microphone on",
    );

    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toContainText("The video lesson has ended.");
    await expect(student.getByTestId("call-done")).toContainText("The video lesson has ended.", {
      timeout: 15_000,
    });

    await teacher.goto(`/en/groups/${groupId}`);
    await expect(teacher.getByTestId("video-start")).toBeVisible();
    await expect(teacher.getByTestId("video-last")).toContainText("1 student joined");

    await studentContext.close();
    await teacherContext.close();
  });

  test("a wrong class link shows the not-found page", async ({ page }) => {
    const response = await page.goto("/en/class/this-link-does-not-exist-000");
    expect(response?.status()).toBe(404);
  });
});
