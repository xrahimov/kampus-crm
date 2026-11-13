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

/**
 * The daily summary and the floating assistant (A-190, A-191). The config
 * switches the daily opening off for every other spec; here it is on, as for a
 * person who opens Kampus for the first time that day.
 */
test.describe("summary and floating assistant", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a teacher's summary opens once a day and covers only their groups", async ({ page }) => {
    await signIn(page, TEACHER_PHONE);

    // It opens by itself with the teacher's own figures.
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("briefing")).toHaveAttribute("data-loading", "false");
    await expect(panel.getByTestId("briefing-scope")).toContainText("Your groups");
    await expect(panel.getByTestId("briefing-stat-lessons")).toBeVisible();
    await expect(panel.getByTestId("briefing-stat-homeworkToCheck")).toBeVisible();
    // Money and leads belong to the office.
    await expect(panel.getByTestId("briefing-stat-payments")).toHaveCount(0);
    await expect(panel.getByTestId("briefing-stat-newLeads")).toHaveCount(0);
    await expect(panel.getByTestId("briefing-view-management")).toHaveCount(0);
    // Without a key the conclusion is the plain one.
    await expect(panel.getByTestId("briefing-conclusion")).toHaveAttribute("data-mode", "fake");
    await expect(panel.getByTestId("briefing-line").first()).toBeVisible();

    // Another period.
    await panel.getByTestId("briefing-period-week").click();
    await expect(panel.getByTestId("briefing-period-week")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("briefing")).toHaveAttribute("data-loading", "false");

    // "Understood" closes it and it stays closed for the rest of the day.
    await panel.getByTestId("briefing-understood").click();
    await expect(panel).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("assistant-fab")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("assistant-panel")).toHaveCount(0);

    // The floating button brings it back, and the teacher can ask about their day.
    await page.getByTestId("assistant-fab").click();
    await expect(panel).toBeVisible();
    await panel.getByTestId("assistant-tab-chat").click();
    await panel
      .getByTestId("assistant-panel-suggestion")
      .filter({ hasText: "lessons do I have today" })
      .click();
    const answer = panel.getByTestId("assistant-panel-message").nth(1);
    await expect(answer).toHaveAttribute("data-role", "assistant");
    await expect(answer).toContainText("Looked at: my_day");

    // The conversation is the same one on the Assistant page.
    await panel.getByRole("link", { name: "Open as a page" }).click();
    await expect(page).toHaveURL(/\/en\/assistant/);
    await expect(page.getByTestId("assistant-message")).toHaveCount(2);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Assistant" }),
    ).toBeVisible();
  });

  test("the director's summary covers the whole centre with money", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("briefing")).toHaveAttribute("data-loading", "false");
    await expect(panel.getByTestId("briefing-scope")).toContainText("Whole centre");
    await expect(panel.getByTestId("briefing-stat-payments")).toBeVisible();
    await expect(panel.getByTestId("briefing-stat-debtors")).toBeVisible();

    // Switching the daily opening off keeps it closed on the next visit.
    await panel.getByTestId("briefing-auto").click();
    await panel.getByTestId("assistant-panel-close").click();
    await expect(panel).toHaveCount(0);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("kampus.summary.seen.")) localStorage.removeItem(key);
      }
    });
    await page.reload();
    await expect(page.getByTestId("assistant-fab")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("assistant-panel")).toHaveCount(0);
  });
});
