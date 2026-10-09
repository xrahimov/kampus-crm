import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = process.env.SEED_TEACHER_PHONE ?? "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("my salary", () => {
  test("a teacher opens their own salary from the user menu and looks at an earlier month", async ({
    page,
  }) => {
    await signIn(page, TEACHER_PHONE);
    await page.getByTestId("user-menu").click();
    await page.getByTestId("menu-salary").click();
    await expect(page).toHaveURL(/\/en\/account\/salary$/);
    await expect(page.getByRole("heading", { name: "My salary" })).toBeVisible();
    // The seed teacher is paid 40% of the course price per student.
    await expect(page.getByTestId("salary-rule")).toContainText("40%");
    await expect(page.getByTestId("salary-net")).toBeVisible();
    await expect(page.getByTestId("salary-group").first()).toBeVisible();
    await expect(page.getByTestId("salary-status")).toBeVisible();

    await page.getByTestId("salary-prev").click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}$/);
    await expect(page.getByRole("heading", { name: "My salary" })).toBeVisible();
    await page.getByTestId("salary-this-month").click();
    await expect(page).toHaveURL(/\/en\/account\/salary$/);
  });
});
