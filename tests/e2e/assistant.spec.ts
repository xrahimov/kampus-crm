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

/** The Assistant page (A-149) in test mode: a suggestion, a typed question, the answer with its lookups. */
test.describe("assistant", () => {
  test("a manager asks about debtors and gets an answer from the data", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Assistant" })
      .click();
    await expect(page).toHaveURL(/\/en\/assistant/);
    await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
    await expect(page.getByTestId("assistant-mode")).toHaveAttribute("data-mode", "fake");

    // A suggestion is a question.
    await page.getByTestId("assistant-suggestion").filter({ hasText: "Who owes money" }).click();
    await expect(
      page.getByTestId("assistant-message").filter({ hasText: "Who owes money" }),
    ).toBeVisible();
    const answer = page.getByTestId("assistant-message").nth(1);
    await expect(answer).toHaveAttribute("data-role", "assistant");
    await expect(answer).toContainText("Here is what I found");
    await expect(answer).toContainText("Looked at: list_debtors");

    // A typed follow-up draft.
    await page.getByTestId("assistant-input").fill("Draft a short SMS about the unpaid month.");
    await page.getByTestId("assistant-send").click();
    await expect(page.getByTestId("assistant-message")).toHaveCount(4);
    await expect(page.getByTestId("assistant-message").nth(3)).toContainText("Draft:");

    // The Settings card exists for the key.
    await page.goto("/en/settings/integrations");
    await expect(page.getByTestId("integration-ai")).toContainText("AI assistant");
  });
});
