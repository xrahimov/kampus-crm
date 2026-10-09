import { expect, test } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const TEACHER_PHONE = "+998900000004";

test.describe("authentication", () => {
  test("redirects anonymous visitors to the login page in the default locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/uz\/login/);
    await page.goto("/en/groups");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fgroups/);
  });

  test("rejects a wrong password with a translated message", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Phone number").fill(CEO_PHONE);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toHaveText("Wrong phone number or password.");
  });

  test("signs the CEO in, shows every module, switches locale and signs out", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Phone number").fill(CEO_PHONE);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome, Demo CEO");

    const nav = page.getByRole("navigation", { name: "Main" });
    for (const item of [
      "Home",
      "Leads",
      "Teachers",
      "Groups",
      "Students",
      "Exams",
      "Settings",
      "Finance",
      "Reports",
    ]) {
      await expect(nav.getByRole("link", { name: item })).toBeVisible();
    }

    // Locale switch keeps the page and translates it.
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("menuitemradio", { name: "O‘zbekcha" }).click();
    await expect(page).toHaveURL(/\/uz\/dashboard/);
    await expect(nav.getByRole("link", { name: "Guruhlar" })).toBeVisible();

    // Visiting login while signed in goes back to the dashboard.
    await page.goto("/uz/login");
    await expect(page).toHaveURL(/\/uz\/dashboard/);

    await page.getByTestId("user-menu").click();
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/uz\/login/);

    // Session cookie is gone: protected pages redirect again.
    await page.goto("/uz/groups");
    await expect(page).toHaveURL(/\/uz\/login/);
  });

  test("hides navigation items the teacher role may not view", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Phone number").fill(TEACHER_PHONE);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/(dashboard|today)/);

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Groups" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Finance" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });

  test("API rejects a mutation without the CSRF header", async ({ page, request }) => {
    await page.goto("/en/login");
    await page.getByLabel("Phone number").fill(CEO_PHONE);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/(dashboard|today)/);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.post("/api/v1/auth/active-branch", {
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      data: { branchId: null },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  test("API returns 401 for anonymous requests", async ({ request }) => {
    const response = await request.get("/api/v1/auth/me");
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });
});
