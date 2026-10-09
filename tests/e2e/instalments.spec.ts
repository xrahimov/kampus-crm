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

async function studentId(page: Page, name: string) {
  const found = await page.request.get(`/api/v1/students?q=${encodeURIComponent(name)}&pageSize=1`);
  const { items } = (await found.json()) as { items: Array<{ id: string }> };
  return items[0]!.id;
}

/** An earlier run may have left the student in a family: take them out. */
async function leaveFamily(page: Page, id: string) {
  await page.goto(`/en/students/${id}`);
  await expect(page.getByTestId("family-card")).toBeVisible();
  const unlink = page.getByTestId("family-unlink");
  if ((await unlink.count()) > 0) {
    await unlink.click();
    await page.getByRole("button", { name: "Remove from family" }).last().click();
    await expect(page.getByTestId("family-card")).toContainText("No siblings linked yet.");
  }
}

test.describe("instalments and families", () => {
  test("splits a month's fee into parts and links siblings with a family discount", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const two = await studentId(page, "Demo Student Two");
    const one = await studentId(page, "Demo Student One");
    await leaveFamily(page, one);
    await leaveFamily(page, two);

    // Split the fee of the first group from the card's menu.
    const card = page.getByTestId("student-group-card").first();
    await card.getByRole("button", { name: /^Actions for/ }).click();
    await page.getByTestId("split-fee").click();
    const dialog = page.getByTestId("instalments-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("inst-amount")).toBeVisible();
    if ((await dialog.getByTestId("inst-clear").count()) > 0) {
      // Left over from an earlier run.
      await dialog.getByTestId("inst-clear").click();
      await expect(dialog).toBeHidden();
      await card.getByRole("button", { name: /^Actions for/ }).click();
      await page.getByTestId("split-fee").click();
      await expect(dialog.getByTestId("inst-amount")).toBeVisible();
    }
    await expect(dialog.getByTestId("inst-part")).toHaveCount(2);
    await dialog.getByTestId("inst-add").click();
    await expect(dialog.getByTestId("inst-part")).toHaveCount(3);
    await dialog.getByTestId("inst-equal").click();
    await expect(dialog.getByTestId("inst-remaining")).toContainText("UZS 0");
    await dialog.getByRole("button", { name: "Save the split" }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByTestId("instalments-row").locator("li")).toHaveCount(3);

    // Link a sibling with a family discount.
    await page.getByTestId("family-link").click();
    const link = page.getByTestId("family-link-dialog");
    await expect(link).toBeVisible();
    await link.getByLabel("Sibling").fill("Demo Student One");
    await page.getByRole("option", { name: /Demo Student One/ }).click();
    await link.getByLabel("Family name").fill("E2E family");
    await link.getByLabel("Family discount, %").fill("10");
    await link.getByRole("button", { name: "Save" }).click();
    await expect(link).toBeHidden();
    const family = page.getByTestId("family-card");
    await expect(family.getByTestId("family-name")).toHaveText("E2E family");
    await expect(family.getByTestId("family-member")).toHaveCount(2);
    await expect(family.getByTestId("family-discount")).toContainText("Family discount 10%");
    await expect(card.getByTestId("discount-banner")).toContainText("Family discount 10%");

    // A new percent shows at once.
    await page.getByTestId("family-edit").click();
    const edit = page.getByTestId("family-edit-dialog");
    await edit.getByLabel("Family discount, %").fill("15");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await expect(family.getByTestId("family-discount")).toContainText("Family discount 15%");
    await expect(card.getByTestId("discount-banner")).toContainText("Family discount 15%");

    // The sibling's page shows the same family, in Uzbek too.
    await page.goto(`/uz/students/${one}`);
    await expect(page.getByTestId("family-card")).toContainText("E2E family");
    await expect(page.getByTestId("family-card")).toContainText("Oilaviy chegirma 15%");

    // Clean up so the test can run again: the split and the family go.
    await page.goto(`/en/students/${two}`);
    await card.getByRole("button", { name: /^Actions for/ }).click();
    await page.getByTestId("split-fee").click();
    await expect(dialog.getByTestId("inst-clear")).toBeVisible();
    await dialog.getByTestId("inst-clear").click();
    await expect(dialog).toBeHidden();
    await expect(card.getByTestId("instalments-row")).toHaveCount(0);
    await leaveFamily(page, two);
    await leaveFamily(page, one);
  });
});
