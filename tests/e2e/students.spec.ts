import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

test.describe("students and payments", () => {
  test("CEO creates a student in a group, takes a payment, prints the receipt", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Students" })
      .click();
    await expect(page).toHaveURL(/\/en\/students/);
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    await expect(page.getByTestId("students-count")).toContainText("students");
    await expect(page.getByTestId("student-row").first()).toBeVisible();

    const name = `E2E Payer ${Date.now()}`;
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("student-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Full name").fill(name);
    await dialog.getByLabel("Phone").fill(`+99893${String(Date.now()).slice(-7)}`);
    await dialog.getByTestId("section-group").click();
    await dialog.getByLabel("Group", { exact: true }).click();
    await page.getByRole("option", { name: /GE-Morning A1/ }).click();
    await dialog.getByLabel("Joined the group on").fill("2026-09-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // Saving a new student opens the profile.
    await expect(page).toHaveURL(/\/en\/students\/[a-z0-9]+/);
    await expect(page.getByTestId("student-title")).toHaveText(name);
    const card = page.getByTestId("student-group-card");
    await expect(card).toContainText("GE-Morning A1");
    // Active from 1 Sep: September and October are charged, so the student is in debt.
    await expect(card).toContainText("-");
    await expect(page.getByTestId("lesson-calendar")).toBeVisible();

    // Pay what is owed with the "fill in" button.
    await page.getByTestId("pay-student").click();
    const pay = page.getByTestId("payment-dialog");
    await expect(pay).toBeVisible();
    await expect(page.getByTestId("payment-info")).toContainText("Balance");
    await pay.getByRole("button", { name: "Cash" }).click();
    await page.getByTestId("pay-autofill").click();
    const amount = await pay.getByLabel("Amount").inputValue();
    expect(Number(amount)).toBeGreaterThan(0);
    const receiptPromise = page.context().waitForEvent("page");
    await pay.getByRole("button", { name: "Save" }).click();
    await expect(pay).toBeHidden();

    // The seed turns "print receipt after payment" on, so a receipt tab opens.
    const receipt = await receiptPromise;
    await expect(receipt.getByTestId("receipt")).toBeVisible();
    await expect(receipt.getByTestId("receipt")).toContainText(name);
    await expect(receipt.getByTestId("receipt-amount")).toBeVisible();
    await receipt.close();

    await expect(page.getByTestId("payment-row")).toHaveCount(1);
    await expect(page.getByTestId("payment-row").first()).toContainText("GE-Morning A1");
    await expect(page.getByTestId("payment-row").first()).toContainText("Cash");

    // A comment and a parent.
    await page.getByTestId("tab-comments").click();
    await page.getByTestId("add-comment").click();
    await page.getByTestId("comment-dialog").getByLabel("New note").fill("Pays on time");
    await page.getByTestId("comment-dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("student-comment")).toContainText("Pays on time");
    await page.getByTestId("tab-parents").click();
    await page.getByTestId("add-parent").click();
    await page.getByTestId("parent-dialog").getByLabel("Full name").fill("E2E Parent");
    await page.getByTestId("parent-dialog").getByLabel("Phone").fill("+998901112233");
    await page.getByTestId("parent-dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("parent-row")).toContainText("E2E Parent");
    await page.getByTestId("tab-history").click();
    await expect(page.getByTestId("history-row").first()).toBeVisible();
    // Action names are translated, not raw audit keys such as "student.create".
    await expect(
      page.getByTestId("history-row").filter({ hasText: "Student created" }),
    ).toBeVisible();
    await expect(page.getByTestId("history-row").filter({ hasText: "Parent added" })).toBeVisible();

    // The student appears in the list with a balance chip and the group chip.
    await page.goto("/en/students?groupStatus=ACTIVE");
    const row = page.getByTestId("student-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("GE-Morning A1");
  });

  test("group page shows balances, gives a discount and lists student comments", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    await expect(page.getByTestId("member-balance").first()).toBeVisible();

    await page.getByTestId("tab-discounts").click();
    await page.getByTestId("give-discount").click();
    const dialog = page.getByTestId("discount-dialog");
    await dialog.getByLabel("Student").click();
    await page.getByRole("option", { name: "Demo Student One" }).click();
    await dialog.getByLabel("Discounted monthly price").fill("400000");
    await dialog.getByLabel("For how many months").fill("2");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const discountRow = page.getByTestId("discount-row").filter({ hasText: "Demo Student One" });
    await expect(discountRow).toBeVisible();
    // General English costs 450,000 a month, so 400,000 is an 11% discount.
    await expect(discountRow).toContainText("11%");
    // Clean up so the test can run again.
    await discountRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(discountRow).toHaveCount(0);

    await page.getByTestId("tab-comments").click();
    await page.getByTestId("group-comment-form").getByLabel("Student").click();
    await page.getByRole("option", { name: "Demo Student Two" }).click();
    await page.getByTestId("group-comment-form").getByLabel("New note").fill("Group-side note");
    await page.getByTestId("group-comment-form").getByRole("button", { name: "New note" }).click();
    await expect(page.getByTestId("student-comment").first()).toContainText("Group-side note");
  });

  test("receipt settings, payments log and the header payment button", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/receipt");
    await expect(page.getByRole("heading", { name: "Receipt settings" })).toBeVisible();
    await page.getByTestId("receipt-field-teacher").click();
    const addressBox = page.getByTestId("receipt-field-address");
    if ((await addressBox.getAttribute("aria-checked")) !== "true") await addressBox.click();
    await page.getByRole("textbox", { name: "Address" }).fill("1 Demo street");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("receipt-saved")).toBeVisible();
    await expect(page.getByTestId("receipt-preview")).toContainText("1 Demo street");

    await page.goto("/en/settings/payments");
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
    await expect(page.getByTestId("payment-row").first()).toBeVisible();
    await expect(page.getByTestId("payments-total")).toContainText("Total");

    await page.getByTestId("pay-button").click();
    const search = page.getByTestId("pay-search");
    await expect(search).toBeVisible();
    await search.getByLabel("Student name or phone").fill("Demo Student One");
    await search.getByRole("button", { name: /Demo Student One/ }).click();
    await expect(page.getByTestId("payment-dialog")).toBeVisible();
    await expect(page.getByTestId("payment-dialog")).toContainText("Demo Student One");
  });

  test("Uzbek student pages hydrate without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, CEO_PHONE);
    await page.goto("/uz/students");
    await expect(page.getByRole("heading", { name: "O‘quvchilar" })).toBeVisible();
    await page.getByTestId("student-row").first().getByRole("link").first().click();
    await expect(page.getByTestId("student-title")).toBeVisible();
    await expect(page.getByTestId("student-group-card").first()).toContainText("soʻm");
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => /hydrat|#418|#423|#425/i.test(e))).toEqual([]);
  });
});
