import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

// Chromium's fake camera and microphone, no permission prompt, and plain host
// candidates (no mDNS) so two browsers on one machine can connect without STUN.
test.use({
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
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

/** Telegram's consent screen, played by the test (the server's fake provider, TELEGRAM_LOGIN_FAKE=1). */
async function telegramLogin(page: Page, person: { id: string; name: string; phone: string }) {
  const start = await page.getByTestId("student-login-telegram").getAttribute("href");
  const res = await page.request.get(start!, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const auth = new URL(res.headers()["location"]!);
  const back = new URL(auth.searchParams.get("redirect_uri")!);
  back.searchParams.set("state", auth.searchParams.get("state")!);
  const claims = { id: person.id, name: person.name, phone_number: person.phone };
  back.searchParams.set(
    "code",
    `fake.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`,
  );
  await page.goto(back.toString());
}

test.describe("the lesson link from inside the video lesson (A-195)", () => {
  test("a teacher copies the link in the lesson; a student signs in and joins, others do not get in", async ({
    browser,
    page,
  }) => {
    test.skip(process.env.TELEGRAM_LOGIN_FAKE !== "1", "needs TELEGRAM_LOGIN_FAKE=1 on the server");
    test.setTimeout(150_000);
    await signIn(page, CEO_PHONE);
    const stamp = String(Date.now()).slice(-7);

    // The centre has Telegram sign-in.
    await page.goto("/en/settings/integrations");
    const form = page.getByTestId("integration-telegram");
    const enabled = form.getByRole("switch", { name: "Enabled" });
    if (!(await enabled.isChecked())) await enabled.click();
    await form.getByLabel("Telegram login: Client ID").fill("123456");
    await form.getByLabel("Telegram login: Client Secret").fill(`secret-${stamp}`);
    await form.getByTestId("telegram-save").click();
    await expect(form).toContainText("Saved");

    // One student in the teacher's group and one in another group.
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const groups = (await (await page.request.get("/api/v1/groups?q=GE-", { headers })).json()) as {
      items: Array<{ id: string; name: string; branchId: string }>;
    };
    const morning = groups.items.find((g) => g.name === "GE-Morning A1")!;
    const other = groups.items.find((g) => g.name !== "GE-Morning A1")!;
    expect(other).toBeTruthy();
    const student = async (
      group: { id: string; branchId: string },
      fullName: string,
      phone: string,
    ) => {
      const created = await page.request.post("/api/v1/students", {
        headers,
        data: {
          branchId: group.branchId,
          fullName,
          phone,
          gender: "FEMALE",
          membership: {
            groupId: group.id,
            joinedAt: "2026-09-01",
            customPrice: null,
            note: null,
            status: "ACTIVE",
          },
        },
      });
      expect(created.status()).toBe(201);
    };
    const insider = { name: `E2E Link ${stamp}`, phone: `+99894${stamp}` };
    const outsider = { name: `E2E Elsewhere ${stamp}`, phone: `+99895${stamp}` };
    await student(morning, insider.name, insider.phone);
    await student(other, outsider.name, outsider.phone);

    // The teacher starts the lesson and is alone in it.
    const teacherContext = await browser.newContext({
      permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
    });
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto(`/en/groups/${morning.id}`);
    const card = teacher.getByTestId("group-video");
    if (await card.getByTestId("video-start").isVisible()) {
      await card.getByTestId("video-start").click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher).toHaveURL(/\/en\/video\/[a-z0-9]+/);
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();

    // The link is one press away on the lesson screen, and it carries no secret.
    const origin = new URL(teacher.url()).origin;
    const link = `${origin}/student/lesson/${morning.id}`;
    await expect(teacher.getByTestId("lesson-link-hint")).toContainText("Nobody else is here yet", {
      timeout: 20_000,
    });
    await teacher.getByTestId("copy-lesson-link").click();
    await expect(teacher.getByTestId("lesson-link-notice")).toContainText("Lesson link copied");
    expect(await teacher.evaluate(() => navigator.clipboard.readText())).toBe(link);
    // The same link can be read in People, for when it has to be typed or shown.
    await teacher.getByTestId("toggle-people").click();
    await expect(
      teacher.getByTestId("lesson-link-card").getByTestId("lesson-link-value"),
    ).toHaveValue(link);
    await teacher.getByTestId("toggle-people").click();

    // Opening the link without a session asks to sign in first and shows nothing of the group.
    const studentContext = await browser.newContext({ locale: "en-US" });
    const learner = await studentContext.newPage();
    await learner.goto(link);
    await expect(learner).toHaveURL(/\/en\/student\/login\?next=/);
    await expect(learner.getByTestId("student-login-lesson")).toContainText(
      "Sign in to join your lesson",
    );
    await expect(learner.getByText("GE-Morning A1")).toHaveCount(0);

    // After Telegram sign-in the student is on their own page of the group and joins.
    await telegramLogin(learner, {
      id: `5${stamp}`,
      name: "Link Learner",
      phone: insider.phone.slice(1),
    });
    await expect(learner).toHaveURL(/\/en\/class\/[A-Za-z0-9_-]+$/);
    await expect(learner.getByTestId("class-title")).toHaveText(`Hello, ${insider.name}`);
    await expect(learner.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await learner.getByTestId("join-call").click();
    await expect(learner.getByTestId("call-room")).toBeVisible();
    await expect(teacher.getByTestId("tile-peer").filter({ hasText: insider.name })).toHaveCount(
      1,
      {
        timeout: 20_000,
      },
    );
    // Students do not get the copy button, and the "nobody here" hint is gone for the teacher.
    await expect(learner.getByTestId("copy-lesson-link")).toHaveCount(0);
    await expect(teacher.getByTestId("lesson-link-hint")).toHaveCount(0);
    // Signed in, the link leads straight to the same page.
    const again = await studentContext.newPage();
    await again.goto(link);
    await expect(again).toHaveURL(learner.url());
    await again.close();

    // A student of another group signs in fine but is not let into this lesson.
    const outsiderContext = await browser.newContext({ locale: "en-US" });
    const stranger = await outsiderContext.newPage();
    await stranger.goto(link);
    await telegramLogin(stranger, {
      id: `4${stamp}`,
      name: "Other Learner",
      phone: outsider.phone.slice(1),
    });
    await expect(stranger).toHaveURL(new RegExp(`/en/student/lesson/${morning.id}$`));
    await expect(stranger.getByTestId("lesson-link-other")).toContainText(
      "This lesson is for another group",
    );
    await expect(stranger.getByText("GE-Morning A1")).toHaveCount(0);
    await stranger.getByTestId("lesson-link-home").click();
    await expect(stranger).toHaveURL(/\/en\/student$/);

    // The teacher's own press on the link comes back to the running lesson.
    const second = await teacherContext.newPage();
    await second.goto(link);
    await expect(second).toHaveURL(/\/en\/video\/[a-z0-9]+$/);
    await second.close();

    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toContainText("The video lesson has ended.");
    await outsiderContext.close();
    await studentContext.close();
    await teacherContext.close();
  });
});
