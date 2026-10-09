import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

/** Downloads the dialog's template, replaces the example row with `rows`, returns the file. */
async function filledTemplate(page: Page, dialogTestId: string, rows: unknown[][]) {
  const dialog = page.getByTestId(dialogTestId);
  await expect(dialog).toBeVisible();
  const href = await dialog.getByTestId("import-template").getAttribute("href");
  const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const template = await page.request.get(href!, { headers: { cookie: cookies } });
  expect(template.status()).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await template.body()) as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0]!;
  sheet.spliceRows(2, 1);
  for (const row of rows) sheet.addRow(row);
  return { dialog, sheet, buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

test.describe("archived students and payment history import (A-142)", () => {
  test("an archived student comes in with a closed membership, then their old payments", async ({
    page,
  }) => {
    const stamp = String(Date.now()).slice(-7);
    const name = `E2E Gone ${stamp}`;
    await signIn(page, CEO_PHONE);
    await page.goto("/en/students");

    // Archived students: preview, then import.
    await page.getByTestId("students-import-menu").click();
    await page.getByTestId("students-import-archived").click();
    const archived = await filledTemplate(page, "students-import-archived-dialog", [
      [name, "", "", "2025-09-01", "2026-03-15", "Moved away", "e2e"],
    ]);
    expect(archived.sheet.getRow(1).getCell(5).value).toBe("Left on");
    await archived.dialog
      .getByTestId("import-file")
      .setInputFiles({ name: "archived.xlsx", mimeType: XLSX, buffer: archived.buffer });
    await archived.dialog.getByTestId("import-submit").click();
    await expect(archived.dialog.getByTestId("import-preview")).toContainText(
      "1 rows would be imported and 0 skipped",
    );
    await expect(archived.dialog.getByTestId("import-preview")).toContainText(name);
    await archived.dialog.getByTestId("import-submit").click();
    await expect(archived.dialog.getByTestId("import-result")).toContainText("1 imported");
    await page.keyboard.press("Escape");

    // Payment history for the same (archived) student, found by name.
    await page.getByTestId("students-import-menu").click();
    await page.getByTestId("students-import-history").click();
    const history = await filledTemplate(page, "students-import-history-dialog", [
      ["", name, "", "", "250000", "2026-02-01", "Cash", "old system"],
    ]);
    expect(history.sheet.getRow(1).getCell(5).value).toBe("Amount");
    await history.dialog
      .getByTestId("import-file")
      .setInputFiles({ name: "history.xlsx", mimeType: XLSX, buffer: history.buffer });
    await history.dialog.getByTestId("import-submit").click();
    await expect(history.dialog.getByTestId("import-preview")).toContainText(
      "1 rows would be imported and 0 skipped",
    );
    await history.dialog.getByTestId("import-submit").click();
    await expect(history.dialog.getByTestId("import-result")).toContainText("1 imported");
    await page.keyboard.press("Escape");

    // The archived list shows the student; their page lists the old payment.
    await page.goto(`/en/students?archived=true&q=${encodeURIComponent(name)}`);
    const row = page.getByTestId("student-row").filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await row.getByRole("link", { name }).click();
    await expect(page).toHaveURL(/\/en\/students\/[a-z0-9]+/);
    const legacy = page.getByTestId("legacy-payments");
    await expect(legacy).toBeVisible();
    await expect(legacy.getByTestId("legacy-payment-row")).toHaveCount(1);
    await expect(legacy).toContainText("250");
    await expect(legacy).toContainText("Cash");
    await expect(legacy).toContainText("old system");
  });
});
