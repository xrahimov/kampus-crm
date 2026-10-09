import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const SLUG = `e2e-${STAMP}`;

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("public page per centre", () => {
  test("the CEO switches the page on; a visitor sees courses, the timetable and signs up", async ({
    page,
    browser,
  }) => {
    // Visitors without a session still land on the login on the server's own address.
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto("/");
    await expect(visitor).toHaveURL(/\/(uz|ru|en)\/login/);
    expect((await visitor.goto(`/en/c/${SLUG}`))?.status()).toBe(404);

    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/general");
    const fieldset = page.getByTestId("public-page");
    await expect(fieldset).toBeVisible();
    const toggle = fieldset.getByTestId("switch-publicPage");
    if ((await toggle.getAttribute("data-state")) !== "checked") await toggle.click();
    await fieldset.getByLabel("Page address").fill(SLUG);
    await expect(fieldset.getByTestId("public-page-link")).toContainText(`/en/c/${SLUG}`);
    await fieldset.getByLabel("About the centre").fill("English, German and IT for every age.");
    await fieldset.getByLabel("Phone", { exact: true }).fill("+998 90 000 00 01");
    await fieldset.getByLabel("Instagram (username or link)").fill("@kampus_demo");
    await page.getByTestId("org-save").click();
    await expect(page.getByTestId("org-saved")).toBeVisible();
    await expect(page.getByTestId("public-page-open")).toHaveAttribute("href", `/en/c/${SLUG}`);

    // The page is public: courses with prices, the timetable, the teachers and the form.
    await visitor.goto(`/en/c/${SLUG}`);
    const centre = visitor.getByTestId("public-centre");
    await expect(centre).toBeVisible();
    await expect(centre).toContainText("English, German and IT for every age.");
    await expect(centre.getByRole("link", { name: /Instagram/ })).toHaveAttribute(
      "href",
      "https://instagram.com/kampus_demo",
    );
    expect(await centre.getByTestId("public-course").count()).toBeGreaterThan(0);
    await expect(centre.getByTestId("public-course").first()).toContainText("/ month");
    expect(await centre.getByTestId("public-group").count()).toBeGreaterThan(0);
    expect(await centre.getByTestId("public-teacher").count()).toBeGreaterThan(0);

    // "Sign up" on a course pre-fills the comment; the form makes a lead.
    const course = centre.getByTestId("public-course").first();
    const courseName = (await course.getByRole("heading").first().textContent())!.trim();
    await course.getByRole("link", { name: "Sign up" }).click();
    await expect(visitor).toHaveURL(/course=/);
    await expect(visitor.getByLabel("Comment")).toHaveValue(`Course: ${courseName}`);
    await visitor.getByLabel("Your name").fill(`E2E Public ${STAMP}`);
    await visitor.getByLabel("Phone number").fill(`+99896${String(STAMP).slice(-7)}`);
    await visitor.getByRole("button", { name: "Send" }).click();
    await expect(visitor.getByTestId("public-form-done")).toContainText("Thank you");

    // The Russian page carries the same centre.
    await visitor.goto(`/ru/c/${SLUG}`);
    await expect(visitor.getByRole("heading", { name: "Курсы" })).toBeVisible();

    // The lead is on the board with the course in its comment.
    await page.goto("/en/leads");
    const card = page.getByTestId("lead-card").filter({ hasText: `E2E Public ${STAMP}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`Course: ${courseName}`);

    // Switched off, the page is gone again.
    await page.goto("/en/settings/general");
    await page.getByTestId("public-page").getByTestId("switch-publicPage").click();
    await page.getByTestId("org-save").click();
    await expect(page.getByTestId("org-saved")).toBeVisible();
    expect((await visitor.goto(`/en/c/${SLUG}`))?.status()).toBe(404);
    await visitorContext.close();
  });
});
