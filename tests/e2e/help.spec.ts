import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("help", () => {
  test("search leads to the right section, and the article shows its screenshots", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.getByTestId("nav-help").click();
    await expect(page).toHaveURL(/\/en\/help$/);
    await expect(page.getByTestId("help-audience-CEO")).toHaveAttribute("aria-selected", "true");

    await page.getByTestId("help-search").fill("refund");
    const hit = page.getByTestId("help-hit").first();
    await expect(hit).toContainText("Refunds");
    await hit.click();
    await expect(page).toHaveURL(/\/en\/help\/payments#refund$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Payments and receipts");
    await expect(page.locator("section#refund")).toBeVisible();

    // The screenshot of the payment dialog ships with the app.
    const image = page.locator("section#record img");
    await expect(image).toBeVisible();
    expect(await image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // Uzbek readers get the Uzbek manual and the Uzbek screenshots.
    await page.goto("/uz/help/payments");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("To‘lovlar va cheklar");
    await expect(page.locator("section#record img")).toHaveAttribute("src", /\/help\/uz\//);
  });

  // The test server reads tests/fixtures/help-videos (playwright.config.ts): one English video.
  test("a how-to video plays inside its Help section and on the sign-in page", async ({ page }) => {
    // Signed out: the sign-in page offers the video about signing in.
    await page.goto("/en/login");
    const offer = page.getByTestId("help-video");
    await expect(offer).toContainText("How to sign in for the first time");
    await expect(page.getByTestId("first-sign-in-note")).toContainText(
      "staff approve your account",
    );
    await offer.getByTestId("help-video-play").click();
    const loginPlayer = page.getByTestId("help-video-player");
    await expect
      .poll(() => loginPlayer.evaluate((el) => (el as HTMLVideoElement).videoWidth))
      .toBe(320);
    // No video in Russian on this server, so the Russian page offers none.
    await page.goto("/ru/login");
    await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
    await expect(page.getByTestId("help-video")).toHaveCount(0);

    await signIn(page, CEO_PHONE);
    await page.goto("/en/help");
    await expect(page.getByTestId("help-videos-link")).toContainText("1 short video");
    await page.getByTestId("help-videos-link").click();
    await expect(page).toHaveURL(/\/en\/help\/videos$/);
    await expect(page.getByTestId("help-videos-item")).toHaveCount(1);
    await page.getByRole("link", { name: "Read the steps: Getting started" }).click();
    await expect(page).toHaveURL(/\/en\/help\/getting-started#signIn$/);

    // The video sits in the section it is about, and only there.
    await expect(page.getByTestId("help-video")).toHaveCount(1);
    const section = page.locator("section#signIn");
    await section.getByTestId("help-video-play").click();
    const player = section.getByTestId("help-video-player");
    await expect.poll(() => player.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(320);

    // A browser that seeks gets the part it asked for; unknown names get nothing.
    const part = await page.request.get("/api/v1/help-videos/en/sign-in", {
      headers: { range: "bytes=0-9" },
    });
    expect(part.status()).toBe(206);
    expect(part.headers()["content-range"]).toMatch(/^bytes 0-9\/\d+$/);
    expect((await page.request.get("/api/v1/help-videos/en/groups")).status()).toBe(404);
    expect((await page.request.get("/api/v1/help-videos/en/nothing")).status()).toBe(404);

    await page.goto("/ru/help");
    await expect(page.getByTestId("help-article-card").first()).toBeVisible();
    await expect(page.getByTestId("help-videos-link")).toHaveCount(0);
  });

  test("a teacher opens the teaching manual first", async ({ page }) => {
    await signIn(page, TEACHER_PHONE);
    await page.goto("/en/help");
    await expect(page.getByTestId("help-audience-TEACHER")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByTestId("help-article-card").filter({ hasText: "Teaching a group" }),
    ).toBeVisible();
    await expect(page.getByTestId("help-article-card").filter({ hasText: "Finance" })).toHaveCount(
      0,
    );
  });

  test("a student reaches their manual from the personal page without signing in", async ({
    browser,
  }) => {
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    const groups = await teacher.request.get("/api/v1/groups?pageSize=1");
    const groupId = ((await groups.json()) as { items: Array<{ id: string }> }).items[0]!.id;
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string }>;
    await teacherContext.close();

    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-help").click();
    await expect(student).toHaveURL(new RegExp(`/en/class/${first!.token}/help$`));
    await expect(student.getByRole("heading", { level: 1 })).toHaveText("Your personal page");
    await expect(student.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await student.goto("/en/class/not-a-token/help");
    await expect(student.getByRole("heading", { level: 1 })).not.toHaveText("Your personal page");
  });
});
