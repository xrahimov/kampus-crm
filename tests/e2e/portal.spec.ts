import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups)/);
}

test.describe("student portal", () => {
  test("a student's link shows their lessons, results and schedule without signing in", async ({
    browser,
  }) => {
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    expect(links.ok()).toBe(true);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    expect(first).toBeTruthy();
    await teacherContext.close();

    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("class-title")).toHaveText(`Hello, ${first!.fullName}`);
    await expect(student.getByTestId("portal-stats")).toContainText("Attendance");

    // The seeded group has past lessons; the table lists them newest first.
    await expect(student.getByRole("tab", { name: "Lessons" })).toBeVisible();
    await expect(student.getByRole("columnheader", { name: "Topic" })).toBeVisible();

    await student.getByRole("tab", { name: "Results" }).click();
    await expect(student.getByRole("heading", { name: "Exams" })).toBeVisible();
    await expect(student.getByRole("heading", { name: "Tests" })).toBeVisible();

    await student.getByRole("tab", { name: "Schedule" }).click();
    await expect(student.getByText(/The group runs until/)).toBeVisible();

    // Nothing on the page leads into the staff app.
    await expect(student.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  });
});
