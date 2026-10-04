import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const asExcelBuffer = (bytes: Buffer) => bytes as unknown as ExcelJS.Buffer;

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

async function cookieHeader(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

test.describe("reports and Excel", () => {
  test("every report page renders its KPIs, filters and tables", async ({ page }) => {
    await signIn(page, CEO_PHONE);

    await page.goto("/en/reports");
    for (const key of ["payments", "churn", "graduates", "leads", "students", "statistics"]) {
      await expect(page.getByTestId(`report-${key}`)).toBeVisible();
    }

    await page.goto("/en/reports/payments");
    await expect(page.getByRole("heading", { name: "Payments report" })).toBeVisible();
    await expect(page.getByTestId("kpi-total")).toBeVisible();
    await expect(page.getByTestId("kpi-refunds")).toBeVisible();
    await expect(page.getByTestId("report-year")).toBeVisible();
    await expect(page.getByTestId("teacher-payment-row").first()).toBeVisible();
    await page.getByTestId("payments-tab-staff").click();
    await expect(page.getByTestId("staff-payment-row").first()).toBeVisible();
    await expect(page.getByTestId("report-excel")).toHaveAttribute(
      "href",
      /\/api\/v1\/reports\/payments\/export\.xlsx\?.*locale=en/,
    );

    await page.goto("/en/reports/student-payments");
    await expect(page.getByTestId("student-payments-summary")).toBeVisible();
    await expect(page.getByTestId("student-payments-search")).toBeVisible();
    await page.getByTestId("by-paid-at").click();
    await expect(page).toHaveURL(/byPaidAt=true/);

    await page.goto("/en/reports/churn");
    await expect(page.getByRole("heading", { name: "Left students" })).toBeVisible();
    await expect(page.getByTestId("kpi-churnRate")).toBeVisible();
    await expect(page.getByTestId("kpi-lostRevenue")).toBeVisible();
    // The seed removes two Demo students this month, one of them by transfer.
    const three = page.getByTestId("left-student-row").filter({ hasText: "Demo Student Three" });
    await expect(three).toBeVisible();
    await expect(three).toContainText("Narx");
    await expect(
      page.getByTestId("left-student-row").filter({ hasText: "Demo Student Six" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("transfers-total")).not.toContainText("0 ");
    await page.getByTestId("churn-tab-teacher").click();

    await page.goto("/en/reports/graduates");
    await expect(page.getByTestId("kpi-avgIelts")).toContainText("6.5");
    const graduate = page.getByTestId("graduate-row").filter({ hasText: "Demo Student Four" });
    await expect(graduate).toBeVisible();
    await expect(graduate).toContainText("B2");

    await page.goto("/en/reports/leads");
    await expect(page.getByRole("heading", { name: "Lead statements" })).toBeVisible();
    await expect(page.getByTestId("kpi-newLeads")).toBeVisible();
    await expect(page.getByTestId("filter-source")).toBeVisible();

    await page.goto("/en/reports/students");
    await expect(page.getByRole("heading", { name: "Students report" })).toBeVisible();
    await expect(page.getByTestId("kpi-total")).toBeVisible();
    await expect(page.getByTestId("attendance-totals")).toBeVisible();
    await expect(page.getByTestId("attendance-report-row").first()).toBeVisible();
    await page.getByTestId("students-tab-performance").click();
    await expect(page).toHaveURL(/tab=performance/);
    await expect(page.getByTestId("performance-row").first()).toBeVisible();

    await page.goto("/en/reports/statistics");
    await expect(page.getByRole("heading", { name: "Center statistics" })).toBeVisible();
    await expect(page.getByTestId("kpi-utilisation")).toBeVisible();
    await expect(page.getByTestId("update-capacities")).toHaveAttribute(
      "href",
      /\/settings\/rooms/,
    );
    await expect(page.getByTestId("room-total-row").first()).toBeVisible();
    await page.getByTestId("statistics-view-weekly").click();
    await expect(page).toHaveURL(/view=weekly/);
    await expect(page.getByTestId("statistics-date")).toBeVisible();
  });

  test("EXCEL buttons download workbooks with translated headers", async ({ page, request }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/students");
    await expect(page.getByTestId("students-excel")).toHaveAttribute(
      "href",
      /\/api\/v1\/students\/export\.xlsx\?.*locale=en/,
    );
    const cookie = await cookieHeader(page);
    for (const path of [
      "/api/v1/students/export.xlsx?locale=en",
      "/api/v1/groups/export.xlsx?locale=ru",
      "/api/v1/leads/export.xlsx?locale=uz",
      "/api/v1/staff/export.xlsx",
      "/api/v1/teachers/export.xlsx",
      "/api/v1/payments/export.xlsx",
      "/api/v1/reports/payments/export.xlsx?tab=staff",
      "/api/v1/reports/churn/export.xlsx",
      "/api/v1/reports/graduates/export.xlsx",
      "/api/v1/reports/leads/export.xlsx",
      "/api/v1/reports/students/export.xlsx?tab=performance",
      "/api/v1/reports/statistics/export.xlsx",
    ]) {
      const response = await request.get(path, { headers: { cookie } });
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain(XLSX);
      expect(response.headers()["content-disposition"], path).toContain(".xlsx");
    }
    const students = await request.get("/api/v1/students/export.xlsx?locale=en", {
      headers: { cookie },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(await students.body()));
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(1).getCell(2).value).toBe("Full name");
    expect(sheet.rowCount).toBeGreaterThan(1);
    const russian = await request.get("/api/v1/groups/export.xlsx?locale=ru", {
      headers: { cookie },
    });
    const ru = new ExcelJS.Workbook();
    await ru.xlsx.load(asExcelBuffer(await russian.body()));
    expect(ru.worksheets[0]!.getRow(1).getCell(2).value).toBe("Название");

    // Groups without a session are refused.
    const anonymous = await request.get("/api/v1/students/export.xlsx");
    expect(anonymous.status()).toBe(401);
  });

  test("imports students from a filled template and reports the skipped rows", async ({
    page,
    request,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/students");
    await page.getByTestId("students-import").click();
    const dialog = page.getByTestId("students-import-dialog");
    await expect(dialog).toBeVisible();
    const templateHref = await dialog.getByTestId("import-template").getAttribute("href");
    expect(templateHref).toContain("/api/v1/students/import-template.xlsx");
    const template = await request.get(templateHref!, {
      headers: { cookie: await cookieHeader(page) },
    });
    expect(template.status()).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(await template.body()));
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).value).toBe("Full name");
    // Replace the example row with two real rows and a duplicate.
    sheet.spliceRows(2, sheet.rowCount);
    sheet.addRow([
      `E2E Import ${STAMP}`,
      `+99893${String(STAMP).slice(-7)}`,
      "F",
      "02.03.2011",
      "excel",
    ]);
    sheet.addRow([`E2E Import Two ${STAMP}`, "", "male", "", ""]);
    sheet.addRow([`E2E Import Dup ${STAMP}`, `+99893${String(STAMP).slice(-7)}`, "", "", ""]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await dialog.getByTestId("import-file").setInputFiles({
      name: "students.xlsx",
      mimeType: XLSX,
      buffer,
    });
    await dialog.getByTestId("import-submit").click();
    const result = dialog.getByTestId("import-result");
    await expect(result).toContainText("2 imported, 1 skipped");
    await expect(result).toContainText("Row 4");
    await expect(result).toContainText("Duplicate of an earlier row");
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toBeHidden();
    await page.getByPlaceholder("Search…").fill(`E2E Import ${STAMP}`);
    await expect(page.getByTestId("student-row")).toHaveCount(1);
    await expect(page.getByTestId("student-row")).toContainText(`E2E Import ${STAMP}`);
  });

  test("leave reasons are managed from the churn report and offered when removing", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/reports/churn");
    await page.getByTestId("manage-reasons").click();
    const dialog = page.getByTestId("reasons-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("reason-row").filter({ hasText: "Narx" })).toBeVisible();
    await dialog.getByTestId("reason-name").fill(`E2E Reason ${STAMP}`);
    await dialog.getByTestId("add-reason").click();
    const row = dialog.getByTestId("reason-row").filter({ hasText: `E2E Reason ${STAMP}` });
    await expect(row).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).first().click();

    // The remove dialog on a group offers the configured reasons.
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "IELTS Evening" }).click();
    await expect(page.getByTestId("group-title")).toHaveText("IELTS Evening");
    await page.getByRole("button", { name: /Actions for Demo Student Five/ }).click();
    await page.getByRole("menuitem", { name: "Remove from group" }).click();
    await expect(page.getByTestId("leave-reason-select")).toBeVisible();
    await page.getByTestId("leave-reason-select").click();
    await expect(page.getByRole("option", { name: `E2E Reason ${STAMP}` })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Clean up the reason.
    await page.goto("/en/reports/churn");
    await page.getByTestId("manage-reasons").click();
    await dialog
      .getByTestId("reason-row")
      .filter({ hasText: `E2E Reason ${STAMP}` })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      dialog.getByTestId("reason-row").filter({ hasText: `E2E Reason ${STAMP}` }),
    ).toHaveCount(0);
  });
});
