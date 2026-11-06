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

test.describe("badges (A-163)", () => {
  test("the student's page and the staff profile show the eight badges", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, CEO_PHONE);
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = page.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const links = await page.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; studentId: string }>;

    // Staff: the profile's Progress tab lists the badges, locked ones with their hint.
    await page.goto(`/en/students/${first!.studentId}`);
    await page.getByRole("tab", { name: "Progress" }).click();
    const staff = page.getByTestId("student-badges");
    await expect(staff).toBeVisible();
    await expect(staff.getByTestId("badge-tile")).toHaveCount(8);
    await expect(staff.getByTestId("student-badges-count")).toHaveText(/\d of 8 earned/);
    await expect(
      staff.getByTestId("badge-tile").filter({ hasText: "10-lesson streak" }),
    ).toContainText(/Attend ten lessons in a row|Earned/);

    // The student sees the same tiles on their own page.
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    const mine = student.getByTestId("portal-badges");
    await expect(mine).toBeVisible();
    await expect(mine.getByTestId("badge-tile")).toHaveCount(8);
    await expect(mine.getByTestId("badge-tile").first()).toHaveAttribute(
      "data-earned",
      /true|false/,
    );
  });
});
