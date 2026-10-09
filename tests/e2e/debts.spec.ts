import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups)/);
}

const plusDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test.describe("debt collection", () => {
  test("a new debtor is listed, promises to pay, and leaves the list once paid", async ({
    page,
    request,
  }) => {
    await signIn(page, CEO_PHONE);
    const name = `E2E Debtor ${Date.now()}`;
    const phone = `+99896${String(Date.now()).slice(-7)}`;

    // Joined in September without paying: two months are owed.
    await page.goto("/en/students");
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("student-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Full name").fill(name);
    await dialog.getByLabel("Phone").fill(phone);
    await dialog.getByTestId("section-group").click();
    await dialog.getByLabel("Group", { exact: true }).click();
    await page.getByRole("option", { name: /GE-Morning A1/ }).click();
    await dialog.getByLabel("Joined the group on").fill("2026-09-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/en\/students\/[a-z0-9]+/);
    const studentUrl = page.url();

    // The Debtors page lists them from the first unpaid month.
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Debtors" })
      .click();
    await expect(page).toHaveURL(/\/en\/debts/);
    await expect(page.getByRole("heading", { name: "Debtors" })).toBeVisible();
    await expect(page.getByTestId("debts-summary-debtors")).toBeVisible();
    await page.goto(`/en/debts?q=${encodeURIComponent(name)}`);
    const row = page.getByTestId("debt-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("GE-Morning A1");
    await expect(row.getByTestId("debt-amount")).toContainText("UZS");
    await expect(row).toContainText("since Sep 1, 2026");
    await expect(row).toContainText("Nobody has called yet");
    await expect(row.getByTestId("debt-status")).toHaveCount(0);

    // A call: the student promises to pay next week.
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByTestId("debt-call").click();
    const contact = page.getByTestId("debt-contact-dialog");
    await expect(contact).toBeVisible();
    await expect(contact.getByTestId("debt-contact-phones")).toContainText(phone);
    await contact.getByLabel("Outcome").click();
    await page.getByRole("option", { name: "Promised to pay" }).click();
    await contact.getByLabel("Promised amount (optional)").fill("500000");
    await contact.getByLabel("Note").fill("Pays after salary day");
    // The promise needs a date.
    await contact.getByRole("button", { name: "Save" }).click();
    await expect(contact.getByRole("alert")).toContainText("Required");
    await contact.getByLabel("Promised to pay by").fill(plusDays(7));
    await contact.getByRole("button", { name: "Save" }).click();
    await expect(contact).toBeHidden();
    await expect(row.getByTestId("debt-status")).toHaveText("Promised");
    await expect(row).toContainText("Promised to pay");
    await expect(row).toContainText("by Demo CEO");
    await expect(row).toContainText("500,000");

    // The history keeps the call, and the "Promised" filter finds the row.
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByTestId("debt-history").click();
    const history = page.getByTestId("debt-history-dialog");
    await expect(history).toBeVisible();
    const entry = history.getByTestId("debt-contact");
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText("Call");
    await expect(entry).toContainText("Promised to pay");
    await expect(entry).toContainText("Pays after salary day");
    await expect(entry).toContainText("by Demo CEO");
    await page.keyboard.press("Escape");
    await expect(history).toBeHidden();
    await page.goto(`/en/debts?status=PROMISED&q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("debt-row").filter({ hasText: name })).toBeVisible();
    await page.goto(`/en/debts?status=OPEN&q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("debt-row").filter({ hasText: name })).toHaveCount(0);

    // The Excel export carries the same row.
    await page.goto(`/en/debts?q=${encodeURIComponent(name)}`);
    const href = await page.getByTestId("debts-excel").getAttribute("href");
    expect(href).toContain("/api/v1/debts/export.xlsx");
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const file = await request.get(href!, { headers: { cookie: cookies } });
    expect(file.status()).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.body()) as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(1).getCell(2).value).toBe("Full name");
    const names: string[] = [];
    sheet.eachRow((r, i) => {
      if (i > 1) names.push(String(r.getCell(2).value ?? ""));
    });
    expect(names).toContain(name);

    // Paying what is owed closes the case as a kept promise: the row leaves the active list.
    await page.goto(studentUrl);
    await page.getByTestId("pay-student").click();
    const pay = page.getByTestId("payment-dialog");
    await expect(pay).toBeVisible();
    await pay.getByRole("button", { name: "Cash" }).click();
    await page.getByTestId("pay-autofill").click();
    expect(Number(await pay.getByLabel("Amount").inputValue())).toBeGreaterThan(0);
    const receiptPromise = page.context().waitForEvent("page");
    await pay.getByRole("button", { name: "Save" }).click();
    await expect(pay).toBeHidden();
    await (await receiptPromise).close();
    await page.goto(`/en/debts?q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("debt-row").filter({ hasText: name })).toHaveCount(0);
    await page.goto(`/en/debts?status=CLOSED&q=${encodeURIComponent(name)}`);
    const closed = page.getByTestId("debt-row").filter({ hasText: name });
    await expect(closed).toBeVisible();
    await expect(closed.getByTestId("debt-status")).toHaveText("Promise kept");
  });

  test("the reminder cadence is set in general settings and remembered", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/general");
    const cadence = page.getByTestId("debt-cadence");
    await expect(cadence).toBeVisible();
    const telegram = cadence.locator("#cadence-debtTelegramDays");
    await expect(telegram).toHaveValue("1");
    await expect(cadence.locator("#cadence-debtSmsDays")).toHaveValue("3");
    await expect(cadence.locator("#cadence-debtTaskDays")).toHaveValue("7");
    await telegram.fill("2");
    await page.getByTestId("org-save").click();
    await expect(page.getByTestId("org-saved")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("debt-cadence").locator("#cadence-debtTelegramDays")).toHaveValue(
      "2",
    );
    // Back to the default so the seed state is stable for other runs.
    await page.getByTestId("debt-cadence").locator("#cadence-debtTelegramDays").fill("1");
    await page.getByTestId("org-save").click();
    await expect(page.getByTestId("org-saved")).toBeVisible();
  });

  test("a teacher sees neither the page nor the API", async ({ page, request }) => {
    await signIn(page, TEACHER_PHONE);
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Debtors" }),
    ).toHaveCount(0);
    await page.goto("/en/debts");
    await expect(page.getByText("No access")).toBeVisible();
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.get("/api/v1/debts", { headers: { cookie: cookies } });
    expect(response.status()).toBe(403);
  });
});
