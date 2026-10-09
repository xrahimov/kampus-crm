import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const EXAM_NAME = `E2E Exam ${STAMP}`;

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("exams", () => {
  test("CEO creates a group exam, grades it and sees it on the group tab", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Exams" })
      .click();
    await expect(page).toHaveURL(/\/en\/exams/);
    await expect(page.getByRole("heading", { name: "Exams", exact: true })).toBeVisible();
    // Seeded upcoming group exam within the default ±1 month range.
    await expect(
      page.getByTestId("exam-row").filter({ hasText: "Unit 1–3 progress test" }),
    ).toBeVisible();
    await expect(page.getByTestId("exam-count-GROUP")).not.toHaveText("0");

    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("exam-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Exam name").fill(EXAM_NAME);
    await dialog.getByLabel("Group", { exact: true }).click();
    await page.getByRole("option", { name: /GE-Morning A1/ }).click();
    await dialog.getByLabel("Exam date").fill(new Date().toISOString().slice(0, 10));
    await dialog.getByLabel("Start time").fill("14:00");
    await dialog.getByLabel("End time").fill("15:00");
    await dialog.getByLabel("Pass score").fill("60");
    await dialog.getByLabel("Maximum score").fill("100");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("exam-row").filter({ hasText: EXAM_NAME });
    await expect(row).toBeVisible();
    await expect(row).toContainText("GE-Morning A1");
    await expect(row).toContainText("14:00 – 15:00");
    await expect(row).toContainText("Not started");

    // Grading sheet: members of the group, enter one score, save.
    await row.getByRole("link", { name: EXAM_NAME }).click();
    await expect(page).toHaveURL(/\/en\/exams\/[a-z0-9]+/);
    await expect(page.getByRole("heading", { name: EXAM_NAME })).toBeVisible();
    const first = page.getByTestId("result-row").first();
    await expect(first).toBeVisible();
    await expect(first).toContainText("Not graded");
    await first.getByRole("spinbutton").fill("75");
    await page.getByTestId("save-results").click();
    await expect(page.getByRole("status")).toHaveText("Results saved.");
    await expect(first).toContainText("Passed");
    await page.getByTestId("exam-finish").click();
    await expect(page.getByText("Finished", { exact: true }).first()).toBeVisible();

    // The group's IMTIHON tab lists it.
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await page.getByTestId("tab-exams").click();
    await expect(page.getByTestId("group-exam-row").filter({ hasText: EXAM_NAME })).toContainText(
      "Finished",
    );

    // Finished exams leave the default "Not started" list.
    await page.goto("/en/exams");
    await expect(page.getByTestId("exam-row").filter({ hasText: EXAM_NAME })).toHaveCount(0);
    await page.goto("/en/exams?status=FINISHED");
    await expect(page.getByTestId("exam-row").filter({ hasText: EXAM_NAME })).toBeVisible();
  });

  test("mock exams tab shows registrations and the student progress tab has KPIs", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/exams?type=MOCK");
    const mock = page.getByTestId("exam-row").filter({ hasText: "IELTS Mock (October)" });
    await expect(mock).toBeVisible();
    await expect(mock).toContainText("Mock exam");
    await expect(mock).toContainText("20"); // capacity
    await mock.getByRole("link", { name: "IELTS Mock (October)" }).click();
    await expect(page.getByTestId("register-search")).toBeVisible();
    await expect(page.getByTestId("result-row")).toHaveCount(2);

    await page.goto("/uz/exams");
    await expect(page.getByRole("heading", { name: "Imtihonlar", exact: true })).toBeVisible();
    await expect(page.getByTestId("exam-tab-MOCK")).toContainText("Mock imtihonlar");

    await page.goto("/en/students");
    await page.getByTestId("student-row").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/en\/students\/[a-z0-9]+/);
    await page.getByTestId("tab-progress").click();
    await expect(page.getByTestId("progress-kpi")).toHaveCount(3);
    await expect(page.getByText("Exam results", { exact: true })).toBeVisible();
  });
});
