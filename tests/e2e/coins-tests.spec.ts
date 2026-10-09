import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("coins and tests", () => {
  test("coin settings, giving coins from the group tab and the coins report", async ({ page }) => {
    await signIn(page, CEO_PHONE);

    // Settings → Coin settings: rules seeded with the reference's amounts, add a manual reason.
    await page.goto("/en/settings/coins");
    await expect(page.getByTestId("coin-rule")).toHaveCount(4);
    await expect(page.getByTestId("coin-rule").first()).toContainText("Attendance");
    const reasonName = `E2E reason ${STAMP}`;
    await page.getByTestId("add-reason").click();
    const reasonDialog = page.getByTestId("coin-reason-dialog");
    await reasonDialog.getByLabel("Reason").fill(reasonName);
    await reasonDialog.getByLabel("Maximum coins").fill("12");
    await reasonDialog.getByRole("button", { name: "Save" }).click();
    await expect(reasonDialog).toBeHidden();
    await expect(page.getByTestId("coin-reason-row").filter({ hasText: reasonName })).toContainText(
      "up to 12",
    );

    // Group → Coins tab: ranking and "Give coins".
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await page.getByTestId("tab-coins").click();
    const firstRow = page.getByTestId("coin-row").first();
    await expect(firstRow).toBeVisible();
    const before = Number(await firstRow.getByTestId("coin-balance").innerText());
    const richStudent = (await firstRow.getByRole("cell").nth(1).innerText()).trim();
    await firstRow.getByTestId("give-coins").click();
    const give = page.getByTestId("give-coins-dialog");
    await expect(give).toBeVisible();
    await give.getByLabel("Reason").click();
    await page.getByRole("option", { name: new RegExp(reasonName) }).click();
    await give.getByLabel("Coins", { exact: true }).fill("7");
    await give.getByLabel("Comment").fill("Great answer");
    await give.getByRole("button", { name: "Save" }).click();
    await expect(give).toBeHidden();
    await expect(page.getByTestId("coin-row").first().getByTestId("coin-balance")).toHaveText(
      String(before + 7),
    );

    // Reports → Coins: KPIs, rating, marketplace with the seeded products, request flow.
    await page.goto("/en/reports");
    await page.getByTestId("report-coins").click();
    await expect(page).toHaveURL(/\/en\/reports\/coins/);
    await expect(page.getByTestId("coins-kpi")).toHaveCount(4);
    await expect(page.getByTestId("rating-row").first()).toBeVisible();
    await page.getByTestId("rating-row").first().getByTestId("rating-view").click();
    await expect(page.getByTestId("coin-history")).toContainText("Balance:");
    await page.keyboard.press("Escape");

    await page.getByTestId("coins-tab-marketplace").click();
    await expect(page.getByTestId("product-row").filter({ hasText: "Daftar" })).toBeVisible();
    await page.getByTestId("add-product").click();
    const productDialog = page.getByTestId("product-dialog");
    await productDialog.getByLabel("Name").fill(`E2E Sticker ${STAMP}`);
    await productDialog.getByLabel("Price (coins)").fill("1");
    await productDialog.getByLabel("Stock").fill("3");
    await productDialog.getByRole("button", { name: "Save" }).click();
    await expect(productDialog).toBeHidden();
    await expect(
      page.getByTestId("product-row").filter({ hasText: `E2E Sticker ${STAMP}` }),
    ).toBeVisible();

    await page.getByTestId("coins-tab-requests").click();
    await page.getByTestId("add-request").click();
    const requestDialog = page.getByTestId("request-dialog");
    // The student who just received coins can afford a 1-coin product.
    await requestDialog.getByTestId("request-student").fill(richStudent.slice(0, 12));
    const candidates = page.getByTestId("request-candidates");
    await expect(candidates).toBeVisible();
    await candidates
      .getByRole("button", { name: new RegExp(richStudent) })
      .first()
      .click();
    await requestDialog.getByTestId("request-product").click();
    await page.getByRole("option", { name: new RegExp(`E2E Sticker ${STAMP}`) }).click();
    await requestDialog.getByRole("button", { name: "Save" }).click();
    await expect(requestDialog).toBeHidden();
    const request = page.getByTestId("request-row").filter({ hasText: `E2E Sticker ${STAMP}` });
    await expect(request).toContainText("Pending");
    await request.getByTestId("approve-request").click();
    await expect(request).toContainText("Approved");
  });

  test("question bank, test creation, result entry and the analysis tabs", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/tests");
    await expect(page.getByTestId("tests-kpi")).toHaveCount(4);
    await expect(
      page.getByTestId("test-row").filter({ hasText: "Unit 1 grammar check" }),
    ).toBeVisible();

    // Question bank: add a question with three options.
    await page.getByTestId("tests-tab-bank").click();
    await expect(page.getByTestId("question-row").first()).toBeVisible();
    await page.getByTestId("add-button").click();
    const q = page.getByTestId("question-dialog");
    await q.getByLabel("Subject").fill("English");
    await q.getByLabel("Topic").fill(`E2E topic ${STAMP}`);
    await q.getByLabel("Question").fill(`E2E question ${STAMP}: 2 + 2 = ?`);
    await q.getByLabel("Option 1").fill("3");
    await q.getByLabel("Option 2").fill("4");
    await q.getByTestId("add-option").click();
    await q.getByLabel("Option 3").fill("5");
    await q.getByRole("radio", { name: "Correct" }).nth(1).click();
    await q.getByRole("button", { name: "Save" }).click();
    await expect(q).toBeHidden();
    await expect(
      page.getByTestId("question-row").filter({ hasText: `E2E question ${STAMP}` }),
    ).toContainText("✓ 4");

    // Create an active test for GE-Morning A1 with the new question.
    await page.getByTestId("tests-tab-tests").click();
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("test-dialog");
    const testName = `E2E Test ${STAMP}`;
    await dialog.getByLabel("Test name").fill(testName);
    await dialog.getByLabel("Subject").fill("English");
    await dialog.getByLabel("Status").click();
    await page.getByRole("option", { name: "Active" }).click();
    await dialog
      .getByTestId("test-group-option")
      .filter({ hasText: "GE-Morning A1" })
      .getByRole("checkbox")
      .click();
    await dialog.getByLabel("Search…").fill(`E2E question ${STAMP}`);
    await dialog.getByTestId("bank-option").first().getByRole("checkbox").click();
    await expect(dialog.getByTestId("picked-count")).toHaveText("(1)");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByTestId("test-row").filter({ hasText: testName });
    await expect(row).toContainText("Active");
    await expect(row).toContainText("GE-Morning A1");

    // Enter a result on the detail page.
    await row.getByRole("link", { name: testName }).click();
    await expect(page.getByTestId("test-title")).toHaveText(testName);
    await page.getByTestId("test-record").click();
    const attempt = page.getByTestId("attempt-dialog");
    await attempt.getByTestId("attempt-student").click();
    await page.getByRole("option").first().click();
    await attempt.getByTestId("attempt-question").first().getByRole("radio", { name: "4" }).click();
    await attempt.getByRole("button", { name: "Save" }).click();
    await expect(attempt).toBeHidden();
    await expect(page.getByTestId("attempt-row").first()).toContainText("1 / 1 · 100%");
    await expect(page.getByTestId("attempt-row").first()).toContainText("Passed");

    // Group → Tests and Knowledge tabs; student → Test results tab.
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await page.getByTestId("tab-tests").click();
    await expect(page.getByTestId("group-test-row").filter({ hasText: testName })).toBeVisible();
    await page.getByTestId("tab-knowledge").click();
    await expect(
      page.getByTestId("topic-row").filter({ hasText: `E2E topic ${STAMP}` }),
    ).toContainText("100%");

    await page.goto("/uz/settings/tests");
    await expect(page.getByTestId("tests-tab-bank")).toContainText("Savollar banki");

    await page.goto("/en/students");
    await page.getByTestId("student-row").first().getByRole("link").first().click();
    await page.getByTestId("tab-testResults").click();
    await expect(page.getByTestId("results-kpi")).toHaveCount(5);
    await expect(page.getByText("Problem topics", { exact: true })).toBeVisible();
  });
});
