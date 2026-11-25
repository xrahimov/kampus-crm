import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("the pages the app stores link to (A-267)", () => {
  test("the privacy policy and the delete-account page open without signing in, in three languages", async ({
    page,
  }) => {
    await page.goto("/en/privacy");
    const policy = page.getByTestId("privacy-policy");
    await expect(policy.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
    await expect(policy).toContainText("center.kampus.app");
    await expect(
      policy.getByRole("heading", { name: "What the app asks your phone for" }),
    ).toBeVisible();
    await expect(policy.getByTestId("privacy-contact")).toBeVisible();

    await policy.getByRole("link", { name: "Русский" }).click();
    await expect(page).toHaveURL(/\/ru\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Политика конфиденциальности");
    await page.getByRole("link", { name: "O‘zbekcha" }).click();
    await expect(page).toHaveURL(/\/uz\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Maxfiylik siyosati");

    await page.goto("/en/privacy");
    await page.getByTestId("privacy-to-deletion").click();
    await expect(page).toHaveURL(/\/en\/delete-account$/);
    const deletion = page.getByTestId("delete-account-page");
    await expect(deletion.getByRole("heading", { level: 1 })).toHaveText(
      "Delete your Kampus account",
    );
    await expect(deletion.getByRole("heading", { name: "What is kept" })).toBeVisible();
    // Nobody is signed in: the page offers the two sign-ins, and deletes nothing.
    await expect(deletion.getByTestId("delete-student-sign-in")).toBeVisible();
    await expect(deletion.getByTestId("student-delete-account")).toHaveCount(0);
    await deletion.getByTestId("delete-staff-sign-in").click();
    await expect(page).toHaveURL(/\/en\/login\?next=%2Faccount/);
  });

  test("a staff member asks for their account to be deleted and takes it back", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/account");
    const card = page.getByTestId("account-deletion");
    // Left over from an interrupted run: start from "not asked".
    if (await card.getByTestId("deletion-withdraw").isVisible()) {
      await card.getByTestId("deletion-withdraw").click();
    }
    await card.getByTestId("deletion-ask").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("you can no longer sign in");
    await dialog.getByRole("button", { name: "Ask to delete my account" }).click();
    await expect(card.getByTestId("deletion-asked")).toContainText("You asked on");
    // The request stays after the page is opened again, and the account still works.
    await page.reload();
    await expect(card.getByTestId("deletion-asked")).toBeVisible();
    await card.getByTestId("deletion-withdraw").click();
    await expect(card.getByTestId("deletion-ask")).toBeVisible();
    await expect(card.getByTestId("deletion-asked")).toHaveCount(0);
    await card.getByTestId("deletion-more").click();
    await expect(page).toHaveURL(/\/en\/delete-account$/);
  });
});
