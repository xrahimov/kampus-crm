import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const CATEGORY = `E2E Category ${STAMP}`;

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

test.describe("finance", () => {
  test("CEO sees the overview, creates a category and enters an expense and an advance", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Finance" })
      .click();
    await expect(page).toHaveURL(/\/en\/finance/);
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByTestId("kpi-income")).toBeVisible();
    await expect(page.getByTestId("kpi-expenses")).toContainText("UZS");
    await expect(page.getByTestId("donut")).toBeVisible();
    await expect(page.getByTestId("year-bars")).toBeVisible();
    await expect(page.getByTestId("plan")).toContainText("Monthly plan");
    await expect(page.getByTestId("category-card").filter({ hasText: "Ijara" })).toBeVisible();

    // "+ BO'LIM" on the expense report.
    await page.getByTestId("add-EXPENSE").click();
    const categoryDialog = page.getByTestId("category-dialog");
    await categoryDialog.getByLabel("Category name").fill(CATEGORY);
    await categoryDialog.getByRole("button", { name: "Save" }).click();
    await expect(categoryDialog).toBeHidden();
    const card = page.getByTestId("category-card").filter({ hasText: CATEGORY });
    await expect(card).toBeVisible();

    // "Chiqim kiritish" inside the category with a staff counterparty.
    await card.click();
    await expect(page).toHaveURL(/\/en\/finance\/costs\/[a-z0-9]+/);
    await expect(page.getByRole("heading", { name: CATEGORY })).toBeVisible();
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("entry-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Staff member").click();
    await page.getByRole("option", { name: "Demo Teacher", exact: true }).click();
    await dialog.getByLabel("Amount").fill("250000");
    await dialog.getByLabel("Comment").fill("Markers");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByTestId("entry-row").filter({ hasText: "Markers" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Demo Teacher");
    await expect(row).toContainText("UZS 250,000");
    await expect(page.getByTestId("entries-total")).toContainText("UZS 250,000");

    // "Avans berish".
    await page.goto("/en/finance/advance");
    await expect(page.getByRole("heading", { name: "Advances" })).toBeVisible();
    await expect(page.getByTestId("entry-row").first()).toBeVisible();
    await page.getByTestId("add-button").click();
    await expect(page.getByTestId("entry-dialog")).toBeVisible();
    await page.getByTestId("entry-dialog").getByLabel("Staff member").click();
    await page.getByRole("option", { name: "Demo Teacher Two" }).click();
    await page.getByTestId("entry-dialog").getByLabel("Amount").fill("700000");
    await page.getByTestId("entry-dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("entry-dialog")).toBeHidden();
    await expect(
      page.getByTestId("entry-row").filter({ hasText: "Demo Teacher Two" }).first(),
    ).toContainText("UZS 700,000");
  });

  test("payroll month computes lines, approves one and recalculates; Uzbek page renders", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto(`/en/finance/salary-detail/${thisMonth()}-01`);
    await expect(page.getByRole("heading", { name: /payroll/ })).toBeVisible();
    const teacher = page.getByTestId("payroll-line").filter({ hasText: "Demo Teacher" }).first();
    await expect(teacher).toBeVisible();
    await expect(teacher).toContainText("UZS");
    // A fresh database shows "Approve"; a re-run finds the line approved from before.
    const approve = teacher.getByTestId("approve-line");
    if (await approve.isVisible()) await approve.click();
    await expect(teacher.getByText("Approved")).toBeVisible();
    await page.getByTestId("recalculate").click();
    await expect(page.getByRole("status")).toHaveText("Recalculated.");
    await expect(teacher.getByText("Approved")).toBeVisible();
    await page.getByTestId("save-payroll").click();
    await expect(page.getByRole("status")).toHaveText("Payroll saved.");

    await page.goto("/en/finance");
    await expect(page.getByTestId("payroll-row").first()).toContainText("Saved");

    await page.goto("/uz/finance");
    await expect(page.getByRole("heading", { name: "Moliya", exact: true })).toBeVisible();
    await expect(page.getByText("Umumiy raqamlar")).toBeVisible();
    await expect(page.getByText("Ish haqi hisobotlari")).toBeVisible();
  });
});
