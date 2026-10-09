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

/** Fiscal receipts (A-147): switch on with the fake provider, pay, run the queue, see the sign. */
test.describe("fiscal receipts", () => {
  test("a payment gets a fiscal receipt that prints on the receipt and shows in the history", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    // An amount of its own, so a payment left by an earlier run is not mistaken for this one.
    const amount = 60_000 + (Date.now() % 97) * 1_000;
    const shown = amount.toLocaleString("en-US");

    // Settings → Integrations → Fiscal receipts: on, without an address (the fake provider).
    await page.goto("/en/settings/integrations");
    const card = page.getByTestId("integration-fiscal");
    await expect(card).toBeVisible();
    const fiscalSwitch = page.locator("#fiscal-enabled");
    if ((await fiscalSwitch.getAttribute("aria-checked")) !== "true") await fiscalSwitch.click();
    await card.getByLabel("Taxpayer number (STIR)").fill("123456789");
    await card.getByLabel("Cash register ID").fill("E2E-KKM");
    const autoIssue = page.locator("#fiscal-autoIssue");
    if ((await autoIssue.getAttribute("aria-checked")) !== "true") await autoIssue.click();
    await page.getByTestId("fiscal-save").click();
    await expect(card).toContainText("Saved");

    // A cash payment on a demo student, through the usual dialog.
    const found = await page.request.get("/api/v1/students?q=Demo%20Student%20Two&pageSize=1");
    const { items } = (await found.json()) as { items: Array<{ id: string }> };
    await page.goto(`/en/students/${items[0]!.id}`);
    await page.getByTestId("pay-student").click();
    const pay = page.getByTestId("payment-dialog");
    await expect(pay).toBeVisible();
    await pay.getByRole("button", { name: "Cash" }).click();
    await pay.getByLabel("Amount").fill(String(amount));
    const receiptPromise = page.context().waitForEvent("page");
    await pay.getByRole("button", { name: "Save" }).click();
    await expect(pay).toBeHidden();
    const firstReceipt = await receiptPromise;
    await firstReceipt.close();

    // The history shows the receipt as pending until the queue runs.
    const row = page.getByTestId("payment-row").filter({ hasText: shown }).first();
    await expect(row.getByTestId("payment-fiscal")).toHaveAttribute("data-status", "PENDING");

    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    };
    for (let pass = 0; pass < 6; pass += 1) {
      const run = await page.request.post("/api/v1/jobs/run", { headers });
      expect(run.status()).toBe(200);
      if (!((await run.json()) as { pending: number }).pending) break;
    }
    await page.reload();
    const issuedRow = page.getByTestId("payment-row").filter({ hasText: shown }).first();
    await expect(issuedRow.getByTestId("payment-fiscal")).toHaveAttribute("data-status", "ISSUED");

    // The printed receipt carries the fiscal number and sign.
    const printPromise = page.context().waitForEvent("page");
    await issuedRow.getByRole("button", { name: "Receipt" }).click();
    const print = await printPromise;
    await expect(print.getByTestId("receipt")).toBeVisible();
    await expect(print.getByTestId("receipt-fiscal")).toContainText("Fiscal receipt");
    await expect(print.getByTestId("receipt-fiscal-sign")).toHaveText(/^[0-9A-F]{12}$/);
    await print.close();

    // Off again, so the other cash-desk tests see no fiscal column.
    await page.goto("/en/settings/integrations");
    const again = page.locator("#fiscal-enabled");
    if ((await again.getAttribute("aria-checked")) === "true") await again.click();
    await page.getByTestId("fiscal-save").click();
    await expect(page.getByTestId("integration-fiscal")).toContainText("Saved");
  });
});
