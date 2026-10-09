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

test.describe("integrations", () => {
  test("SMS templates, auto-SMS switches, bulk SMS from the students page and the SMS log", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);

    // Settings → SMS templates: a category and a template with an inserted variable.
    await page.goto("/en/settings/sms");
    await expect(
      page.getByTestId("sms-category-row").filter({ hasText: "To'lovlar" }),
    ).toBeVisible();
    await page.getByTestId("add-sms-category").click();
    const categoryDialog = page.getByTestId("sms-category-dialog");
    await categoryDialog.getByLabel("Category name").fill(`E2E ${STAMP}`);
    await categoryDialog.getByRole("button", { name: "Save" }).click();
    await expect(categoryDialog).toBeHidden();
    await page.getByTestId("add-sms-template").click();
    const templateDialog = page.getByTestId("sms-template-dialog");
    await templateDialog.getByLabel("Category").click();
    await page.getByRole("option", { name: `E2E ${STAMP}` }).click();
    await templateDialog.getByLabel("SMS text").fill(`E2E template ${STAMP} `);
    await templateDialog.getByTestId("variable-studentName").click();
    await expect(templateDialog.getByLabel("SMS text")).toHaveValue(
      `E2E template ${STAMP} {studentName}`,
    );
    await templateDialog.getByRole("button", { name: "Save" }).click();
    await expect(templateDialog).toBeHidden();
    await expect(
      page.getByTestId("sms-template-row").filter({ hasText: `E2E template ${STAMP}` }),
    ).toBeVisible();

    // General settings → Auto SMS tab: ten rows, toggle one and save.
    await page.goto("/en/settings/general?tab=sms");
    await expect(page.getByTestId("auto-sms-row")).toHaveCount(10);
    const absent = page.getByTestId("auto-sms-switch-ABSENT");
    const wasOn = (await absent.getAttribute("aria-checked")) === "true";
    await absent.click();
    await page.getByTestId("save-auto-sms").click();
    await expect(page.getByTestId("auto-sms-saved")).toContainText("Saved");
    await page.reload();
    await expect(page.getByTestId("auto-sms-switch-ABSENT")).toHaveAttribute(
      "aria-checked",
      wasOn ? "false" : "true",
    );
    // put it back
    await page.getByTestId("auto-sms-switch-ABSENT").click();
    await page.getByTestId("save-auto-sms").click();
    await expect(page.getByTestId("auto-sms-saved")).toContainText("Saved");

    // Students page → SMS YUBORISH to everyone in the current filter, using the new template.
    await page.goto("/en/students?groupStatus=ACTIVE");
    await page.getByTestId("students-sms").click();
    const sms = page.getByTestId("send-sms-dialog");
    await expect(sms).toContainText(/\d+ recipients/);
    await sms.getByLabel("Template").click();
    await page.getByRole("option", { name: new RegExp(`E2E template ${STAMP}`) }).click();
    await expect(sms.getByTestId("sms-counter")).toContainText("1 SMS");
    await sms.getByLabel("Message").fill(`E2E bulk ${STAMP}`);
    await sms.getByRole("button", { name: "Save" }).click();
    await expect(sms.getByTestId("sms-result")).toContainText("Sent:");
    await page.keyboard.press("Escape");

    // The log shows the rows as sent by the CEO; the student's SMS tab shows theirs.
    // Demo Student One's number ends in 0000, which the fake gateway rejects, so
    // the batch holds both a Sent and a Failed row; look for the Sent one.
    await page.goto("/en/settings/logs/sms");
    const batchRows = page.getByTestId("sms-log-row").filter({ hasText: `E2E bulk ${STAMP}` });
    const logRow = batchRows.filter({ hasText: "Sent" }).first();
    await expect(logRow).toBeVisible();
    await expect(logRow).toContainText("Demo CEO");
    await expect(batchRows.filter({ hasText: "Failed" }).first()).toContainText(
      "fake: unreachable number",
    );
    await page.goto("/en/students?groupStatus=ACTIVE");
    await page
      .getByTestId("student-row")
      .filter({ hasText: "Demo Student One" })
      .getByRole("link", { name: "Demo Student One" })
      .click();
    await expect(page).toHaveURL(/\/en\/students\/[^/?]+$/);
    await page.getByTestId("tab-sms").click();
    await expect(
      page.getByTestId("student-sms-row").filter({ hasText: `E2E bulk ${STAMP}` }),
    ).toBeVisible();
    await page.getByTestId("tab-calls").click();
    await expect(page.getByTestId("student-call-row").first()).toBeVisible();
    await page.getByTestId("student-call").click();
    await expect(page.getByTestId("call-result")).toBeVisible();
  });

  test("calls, logs, bot recipients, AmoCRM settings, FaceID webhook and the staff attendance report", async ({
    page,
    request,
  }) => {
    await signIn(page, CEO_PHONE);

    await page.goto("/en/settings/calls");
    await expect(page.getByTestId("call-row").first()).toBeVisible();
    await page.getByTestId("calls-direction").click();
    await page.getByRole("option", { name: "Outgoing" }).click();
    await expect(page.getByTestId("call-row").first()).toContainText("Outgoing");

    await page.goto("/en/settings/logs/logins");
    await expect(page.getByTestId("login-row").first()).toContainText("Demo CEO");
    await page.goto("/en/settings/logs/actions");
    await expect(page.getByTestId("action-row").first()).toBeVisible();
    // Every known action shows its translated name, never a raw key like "lead.move".
    await expect(
      page.getByTestId("action-row").filter({
        hasText:
          /\b(payment|discount|membership|group|student|attendance|grades|lead|sms|exam)\.\w+/,
      }),
    ).toHaveCount(0);

    // Bot notifications: add a staff member with a chat id, then remove them again.
    await page.goto("/en/settings/bot");
    await expect(page.getByTestId("recipient-row").filter({ hasText: "Demo Admin" })).toBeVisible();
    const rowsBefore = await page.getByTestId("recipient-row").count();
    await page.getByTestId("add-recipient").click();
    const dialog = page.getByTestId("recipient-dialog");
    await dialog.getByLabel("Staff").click();
    const option = page.getByRole("option").first();
    const staffName = (await option.textContent())!.split("·")[0]!.trim();
    await option.click();
    await dialog.getByLabel("Special ID").fill(`${STAMP}`.slice(-9));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const newRow = page.getByTestId("recipient-row").filter({ hasText: staffName });
    await expect(newRow).toBeVisible();
    await expect(page.getByTestId("recipient-row")).toHaveCount(rowsBefore + 1);
    await newRow.getByRole("button", { name: `Actions for ${staffName}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("recipient-row")).toHaveCount(rowsBefore);

    // AmoCRM: save the four fields, test the connection (fake client without credentials).
    await page.goto("/en/settings/integrations/amocrm");
    await page.getByLabel("Sub Domain").fill("kampusdemo");
    await page.getByTestId("amocrm-save").click();
    await expect(page.getByTestId("integration-amocrm")).toContainText("Saved");
    await page.getByTestId("amocrm-test").click();
    await expect(page.getByTestId("amocrm-test-result")).toBeVisible();

    // FaceID webhook with the seeded demo secret: a check-in for Demo Teacher Three.
    const now = new Date();
    const posted = await request.post("/api/v1/webhooks/face-id", {
      headers: { "x-kampus-secret": "demo-face-id-secret" },
      data: { deviceId: "e2e-terminal", phone: "+998900000007", at: now.toISOString(), kind: "IN" },
    });
    expect(posted.status()).toBe(201);
    expect(await posted.json()).toEqual({ matched: true });
    const rejected = await request.post("/api/v1/webhooks/face-id", {
      headers: { "x-kampus-secret": "wrong" },
      data: { deviceId: "e2e-terminal", phone: "+998900000007", at: now.toISOString(), kind: "IN" },
    });
    expect(rejected.status()).toBe(403);

    await page.goto("/en/reports");
    await page.getByTestId("report-staffAttendance").click();
    await expect(page).toHaveURL(/\/en\/reports\/staff-attendance/);
    await expect(page.getByTestId("attendance-kpi")).toHaveCount(4);
    const teacherThree = page
      .getByTestId("attendance-day-row")
      .filter({ hasText: "Demo Teacher Three" });
    await expect(teacherThree).toBeVisible();
    await expect(teacherThree).toContainText(/\d\d:\d\d/);
    await page.getByTestId("attendance-tab-monthly").click();
    await expect(page.getByTestId("attendance-month-row").first()).toBeVisible();
    await page.getByTestId("attendance-tab-schedules").click();
    const demoAdmin = page.getByTestId("schedule-row").filter({ hasText: "Demo Admin" });
    await expect(demoAdmin).toContainText("09:00–18:00");
    await demoAdmin.getByTestId("edit-schedule").click();
    const schedule = page.getByTestId("schedule-dialog");
    await expect(schedule.getByTestId("schedule-day")).toHaveCount(7);
    await schedule.getByRole("button", { name: "Save" }).click();
    await expect(schedule).toBeHidden();
  });
});
