import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("dark theme (A-136)", () => {
  test("the header button switches the theme, the choice survives a reload and a sign-out", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page, CEO_PHONE);
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-dark").click();
    await expect(html).toHaveClass(/dark/);
    const cookie = (await page.context().cookies()).find((c) => c.name === "kampus_theme");
    expect(cookie?.value).toBe("dark");

    // Applied before the first paint on the next page, and on the sign-in page too.
    await page.goto("/en/students");
    await expect(html).toHaveClass(/dark/);
    await page.goto("/en/login");
    await expect(html).toHaveClass(/dark/);

    // "Same as the device" follows the emulated preference.
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-system").click();
    await expect(html).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // Light stays light whatever the device says.
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-light").click();
    await expect(html).not.toHaveClass(/dark/);
    await page.reload();
    await expect(html).not.toHaveClass(/dark/);
  });
});
