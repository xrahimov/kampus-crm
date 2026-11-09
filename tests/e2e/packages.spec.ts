import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("lesson packages", () => {
  test("a package group sells a package and a lesson attended uses one credit", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/groups");

    // A group that charges per package instead of per month (A-178).
    const name = `E2E Packages ${Date.now()}`;
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("group-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Group name").fill(name);
    await dialog.getByLabel("Course").click();
    await page.getByRole("option", { name: "IELTS Preparation" }).click();
    await dialog.getByTestId("group-billing").click();
    await page.getByRole("option", { name: "Lesson packages" }).click();
    await dialog.getByLabel("Days").click();
    await page.getByRole("option", { name: /Odd days/ }).click();
    await dialog.getByLabel("Start date").fill("2026-09-07");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await page
      .getByTestId("group-row")
      .filter({ hasText: name })
      .getByRole("link", { name })
      .click();
    await expect(page.getByTestId("group-title")).toHaveText(name);
    await expect(page.getByTestId("tab-packages")).toBeVisible();

    await page.getByTestId("add-member").click();
    const member = page.getByTestId("add-member-dialog");
    await member.getByLabel("New student").click();
    await member.getByLabel("Full name").fill("E2E Package Student");
    await member.getByLabel("Joined on").fill("2026-09-07");
    await member.getByRole("button", { name: "Save" }).click();
    await expect(member).toBeHidden();
    const memberRow = page.getByTestId("member-row").filter({ hasText: "E2E Package Student" });
    await expect(memberRow).toBeVisible();
    await expect(memberRow.getByTestId("member-lessons-left")).toHaveText("0 lessons left");

    // The offer, then the sale: one payment and eight credits.
    await page.getByTestId("tab-packages").click();
    await page.getByTestId("add-package").click();
    const pkg = page.getByTestId("package-dialog");
    await pkg.getByLabel("Package name").fill("8 lessons");
    await pkg.getByLabel("Lessons").fill("8");
    await pkg.getByLabel("Price").fill("400000");
    await pkg.getByRole("button", { name: "Save" }).click();
    await expect(pkg).toBeHidden();
    await expect(page.getByTestId("package-row")).toContainText("8 lessons");

    await page.getByTestId("sell-package").click();
    const sell = page.getByTestId("sell-dialog");
    await sell.getByLabel("Student").click();
    await page.getByRole("option", { name: "E2E Package Student" }).click();
    await expect(sell).toContainText("8 lessons are added");
    await sell.getByRole("button", { name: "Save" }).click();
    await expect(sell).toBeHidden();
    await expect(page.getByTestId("credits-row")).toContainText("E2E Package Student");
    await expect(page.getByTestId("credits-left")).toHaveText("8");
    await expect(page.getByTestId("purchase-row")).toContainText("8 lessons");
    await expect(memberRow.getByTestId("member-lessons-left")).toHaveText("8 lessons left");
    // The sale is an ordinary payment, so the member owes nothing.
    await expect(memberRow.getByTestId("member-balance")).toContainText("0");

    // A lesson attended takes one credit.
    await page.getByTestId("tab-attendance").click();
    await page.getByTestId("month-2026-09").click();
    const cell = page
      .getByTestId("attendance-grid")
      .getByRole("button", { name: /E2E Package Student 2026-09-07/ });
    await cell.click();
    await expect(cell).toHaveText("✓");
    await expect(memberRow.getByTestId("member-lessons-left")).toHaveText("7 lessons left");
    await page.getByTestId("tab-packages").click();
    await expect(page.getByTestId("credits-left")).toHaveText("7");
  });
});
