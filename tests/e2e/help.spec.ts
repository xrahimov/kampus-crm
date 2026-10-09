import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
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
