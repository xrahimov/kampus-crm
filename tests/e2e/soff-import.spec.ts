import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

async function workbook(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.describe("SOFF CRM importer (A-143)", () => {
  test("recognises a students export, previews and imports it", async ({ page }) => {
    const stamp = String(Date.now()).slice(-7);
    const name = `E2E Soff ${stamp}`;
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/migration");
    await expect(page.getByRole("heading", { name: "Import from SOFF CRM" })).toBeVisible();

    // A file nobody recognises.
    await page.getByTestId("soff-file").setInputFiles({
      name: "odd.xlsx",
      mimeType: XLSX,
      buffer: await workbook([
        ["Foo", "Bar"],
        ["1", "2"],
      ]),
    });
    await expect(page.getByTestId("soff-detection")).toHaveAttribute("data-kind", "");
    await expect(page.getByTestId("soff-preview-button")).toBeDisabled();

    // The vendor's students list.
    await page.getByTestId("soff-file").setInputFiles({
      name: "students.xlsx",
      mimeType: XLSX,
      buffer: await workbook([
        ["ID", "Ism familiya", "Baho", "Keyingi to'lov", "Telefon", "Izoh", "Guruhlar", "Balans"],
        ["501", name, "Bahosi yo'q", "", `+99897${stamp}`, "soff e2e", "", "0"],
        ["502", "", "", "", `+99896${stamp}`, "", "", "0"],
      ]),
    });
    await expect(page.getByTestId("soff-kind")).toHaveText("Students");
    await expect(page.getByTestId("soff-column")).toHaveCount(8);
    await expect(page.getByTestId("soff-detection")).toContainText("Full name");
    await page.getByTestId("soff-preview-button").click();
    await expect(page.getByTestId("soff-preview")).toContainText(
      "1 rows would be imported and 1 skipped",
    );
    await expect(page.getByTestId("soff-preview")).toContainText(name);
    // A row left out says why in words, not in the server's keys.
    await expect(page.getByTestId("soff-preview")).toContainText("Row 3: Full name: Required.");

    // A preview is of one branch: another branch asks for its own before anything is imported.
    const branch = page.locator("#soff-branch");
    const mine = (await branch.innerText()).trim();
    await branch.click();
    const names = await page.getByRole("option").allInnerTexts();
    const other = names.map((text) => text.trim()).find((text) => text !== mine);
    expect(other).toBeTruthy();
    await page.getByRole("option", { name: other!, exact: true }).click();
    await expect(page.getByTestId("soff-preview")).toHaveCount(0);
    await expect(page.getByTestId("soff-import-button")).toBeDisabled();
    await branch.click();
    await page.getByRole("option", { name: mine, exact: true }).click();
    await page.getByTestId("soff-preview-button").click();
    await expect(page.getByTestId("soff-preview")).toContainText(
      "1 rows would be imported and 1 skipped",
    );
    await page.getByTestId("soff-import-button").click();
    await expect(page.getByTestId("soff-result")).toContainText("1 imported, 1 skipped");

    await page.goto(`/en/students?q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("student-row").filter({ hasText: name })).toHaveCount(1);
  });
});
