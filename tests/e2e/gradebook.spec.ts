import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("gradebook (A-162)", () => {
  test("the CEO sets grade weights on a course and reads the group's gradebook", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const page = await (await browser.newContext()).newPage();
    await signIn(page, CEO_PHONE);

    // Course dialog: the weights must add up to 100.
    await page.goto("/en/settings/courses");
    // Each branch has a General English course; GE-Morning A1 is the Central group's.
    const row = page
      .getByTestId("course-row")
      .filter({ hasText: "General English" })
      .filter({ hasText: "Central" })
      .first();
    await row.getByRole("button", { name: "Actions for General English" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByTestId("course-dialog");
    await expect(dialog).toBeVisible();
    // Start from the defaults whatever an earlier run left behind.
    for (const [key, value] of Object.entries({
      lessons: 30,
      homework: 30,
      exercises: 0,
      tests: 20,
      exams: 20,
    })) {
      await dialog.getByTestId(`course-weight-${key}`).fill(String(value));
    }
    await expect(dialog.getByTestId("course-weights-sum")).toHaveText("Total: 100% (must be 100%)");
    await dialog.getByTestId("course-weight-exercises").fill("10");
    await expect(dialog.getByTestId("course-weights-sum")).toHaveText("Total: 110% (must be 100%)");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("The weights must add up to 100.")).toBeVisible();
    await dialog.getByTestId("course-weight-exams").fill("10");
    await expect(dialog.getByTestId("course-weights-sum")).toHaveText("Total: 100% (must be 100%)");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // Group → Gradebook: a column per weighted category, the final grade and the level.
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    await page.getByTestId("tab-gradebook").click();
    const tab = page.getByTestId("gradebook-tab");
    await expect(tab).toBeVisible();
    await expect(tab.getByRole("columnheader", { name: /Exercises/ })).toBeVisible();
    await expect(tab.getByRole("columnheader", { name: /Final/ })).toBeVisible();
    await expect(tab.getByTestId("gradebook-row").first()).toBeVisible();
    await expect(tab.getByTestId("gradebook-final").first()).toHaveText(/^(—|\d+%)$/);
    await expect(tab.getByTestId("gradebook-weights-link")).toBeVisible();

    // The student's Results tab carries the same grade.
    const groupId = page.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const links = await page.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-results").click();
    await expect(student.getByTestId("portal-gradebook")).toBeVisible();
    await expect(student.getByTestId("portal-gradebook-final")).toHaveText(/No grades yet|\d+%/);
    await expect(student.getByTestId("portal-gradebook-exercises")).toBeVisible();

    // Back to the defaults so other runs start clean.
    await page.goto("/en/settings/courses");
    await row.getByRole("button", { name: "Actions for General English" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("course-weight-exercises").fill("0");
    await dialog.getByTestId("course-weight-exams").fill("20");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  });
});
