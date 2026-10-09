import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("server status (A-134)", () => {
  test("the site owner sees the status card, saves the alert chat and runs a check", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/organizations");
    const card = page.getByTestId("server-status");
    await expect(card).toBeVisible();
    for (const row of ["app", "database", "worker", "jobs", "backup", "disk", "errors"]) {
      await expect(page.getByTestId(`status-${row}`)).toBeVisible();
    }
    await expect(page.getByTestId("status-database")).toHaveAttribute("data-level", "ok");
    await expect(page.getByTestId("status-app")).toContainText("Node v");

    // A chat ID that is not a number is refused; a numeric one is saved.
    await page.getByTestId("alert-chat-id").fill("abc");
    await page.getByTestId("alert-save").click();
    await expect(page.getByText("Enter the numeric Telegram chat ID.")).toBeVisible();
    await page.getByTestId("alert-chat-id").fill("959000111");
    await page.getByTestId("alert-save").click();
    await expect(page.getByTestId("alert-notice")).toHaveText("Saved");

    await page.getByTestId("server-status-check").click();
    await expect(page.getByTestId("server-status-check")).toBeEnabled();
    await expect(page.getByTestId("alerts-open")).toBeVisible();

    // Clearing the field switches alerts off again.
    await page.getByTestId("alert-chat-id").fill("");
    await page.getByTestId("alert-save").click();
    await expect(page.getByTestId("alert-notice")).toHaveText("Saved");
    await expect(page.getByTestId("alert-test")).toBeDisabled();
  });

  test("the status API is closed to everyone else", async ({ page }) => {
    await signIn(page, TEACHER_PHONE);
    const res = await page.request.get("/api/v1/system/status");
    expect(res.status()).toBe(403);
  });
});
