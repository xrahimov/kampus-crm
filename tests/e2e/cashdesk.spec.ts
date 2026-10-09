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

/** "UZS 1,234,567" or "-UZS 5,000" → 1234567 / -5000. */
const parseMoney = (text: string) => Number(text.replace(/[^\d-]/g, ""));

test.describe("cash desk", () => {
  test("a cashier takes a cash payment, closes the day, the CEO accepts it and prints the sheet", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);

    // The seed marks "Cash" as the cash method.
    await page.goto("/en/settings/general");
    await expect(
      page
        .getByTestId("payment-method-row")
        .filter({ hasText: "Cash" })
        .getByTestId("payment-method-cash"),
    ).toBeVisible();

    // A cash payment on a demo student, through the usual dialog.
    const found = await page.request.get("/api/v1/students?q=Demo%20Student%20Two&pageSize=1");
    const { items } = (await found.json()) as { items: Array<{ id: string }> };
    await page.goto(`/en/students/${items[0]!.id}`);
    await page.getByTestId("pay-student").click();
    const pay = page.getByTestId("payment-dialog");
    await expect(pay).toBeVisible();
    await pay.getByRole("button", { name: "Cash" }).click();
    await pay.getByLabel("Amount").fill("150000");
    const receiptPromise = page.context().waitForEvent("page");
    await pay.getByRole("button", { name: "Save" }).click();
    await expect(pay).toBeHidden();
    const receipt = await receiptPromise;
    await receipt.close();

    // Cash desk in the sidebar; the day's figures include that payment.
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Cash desk" })
      .click();
    await expect(page).toHaveURL(/\/en\/cashdesk/);
    await expect(page.getByRole("heading", { name: "Cash desk" })).toBeVisible();
    await page.getByTestId("close-day").click();
    const dialog = page.getByTestId("close-day-dialog");
    await expect(dialog).toBeVisible();
    const cashRow = dialog.getByTestId("close-method").filter({ hasText: "Cash" });
    await expect(cashRow).toContainText("(cash)");
    // The expected cash is whatever the CEO moved today (a fresh seed books its
    // expenses by the CEO on seed day, so it may be negative); the cashier counts
    // 5,000 less than that, or nothing when nothing is expected.
    const expectedText = await dialog.getByTestId("close-expected").textContent();
    const expected = parseMoney(expectedText ?? "");
    expect(Number.isFinite(expected)).toBe(true);
    const counted = Math.max(0, expected - 5_000);
    const difference = counted - expected;
    const differenceText = `${difference < 0 ? "-" : "+"}UZS ${Math.abs(difference).toLocaleString("en-US")}`;
    await dialog.getByTestId("close-counted").fill(String(counted));
    await expect(dialog.getByTestId("close-difference")).toContainText(differenceText);
    await dialog.getByLabel("Note").fill("E2E hand-over");
    await dialog.getByRole("button", { name: "Close the day" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("cash-close-row").filter({ hasText: "Demo CEO" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("row-difference")).toContainText(differenceText);
    await expect(row).toContainText("Awaiting hand-over");

    // The hand-over.
    await row.getByTestId("accept-close").click();
    await expect(row).toContainText("Accepted by Demo CEO");
    await expect(row.getByTestId("accept-close")).toHaveCount(0);

    // The printable sheet with its signature lines.
    const sheetPromise = page.context().waitForEvent("page");
    await row.getByTestId("print-close").click();
    const sheet = await sheetPromise;
    await expect(sheet.getByTestId("cash-close-sheet")).toBeVisible();
    await expect(sheet.getByTestId("cash-close-sheet")).toContainText("Cashier day close");
    await expect(sheet.getByTestId("cash-close-sheet")).toContainText("E2E hand-over");
    await expect(sheet.getByTestId("sheet-difference")).toContainText(differenceText);
    await expect(sheet.getByTestId("sheet-signatures")).toContainText("Cashier: Demo CEO");
    await expect(sheet.getByTestId("sheet-signatures")).toContainText("Accepted by: Demo CEO");
    await sheet.close();

    // An accepted day cannot be closed again.
    await page.getByTestId("close-day").click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("already closed and accepted");
    await dialog.getByTestId("close-counted").fill("1");
    await dialog.getByRole("button", { name: "Close the day" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "already closed" })).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // The Finance page counts the closes; the Uzbek page renders.
    await page.goto("/en/finance");
    await expect(page.getByTestId("cashdesk-card")).toContainText("day close");
    await page.goto("/uz/cashdesk");
    await expect(page.getByRole("heading", { name: "Kassa" })).toBeVisible();
  });
});
