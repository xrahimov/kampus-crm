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

test.describe("certificates of graduation (A-140)", () => {
  test("a graduate gets a numbered certificate that anyone can check by its link", async ({
    page,
    browser,
  }) => {
    await signIn(page, CEO_PHONE);
    const year = String(new Date().getUTCFullYear());
    await page.goto("/en/reports/graduates");
    const row = page.getByTestId("graduate-row").filter({ hasText: "Demo Student Four" });
    await expect(row).toBeVisible();

    // Earlier runs may have left a certificate: revoke it so this run issues anew.
    if (await row.getByTestId("certificate-revoke").isVisible()) {
      await row.getByTestId("certificate-revoke").click();
      await page.getByRole("button", { name: "Revoke" }).last().click();
      await expect(row.getByTestId("certificate-issue")).toBeVisible();
    }
    await row.getByTestId("certificate-issue").click();
    const dialog = page.getByTestId("certificate-dialog");
    await expect(dialog.getByTestId("cert-title")).toHaveValue(/General English|English/);
    await expect(dialog.getByTestId("cert-level")).toHaveValue("B2");
    await dialog.getByRole("button", { name: "Issue certificate" }).click();
    await expect(dialog).toBeHidden();
    const link = row.getByTestId("certificate-open");
    await expect(link).toContainText(`Certificate ${year}-`);

    // The printable sheet.
    const href = (await link.getAttribute("href"))!;
    await page.goto(href);
    const sheet = page.getByTestId("certificate-sheet");
    await expect(sheet.getByTestId("certificate-student")).toHaveText("Demo Student Four");
    await expect(sheet).toContainText("B2");
    await expect(sheet).toContainText(`${year}-`);
    const publicUrl = (await sheet.locator("p.font-mono.break-all").textContent())!.trim();
    expect(publicUrl).toMatch(/\/cert\/[A-Za-z0-9_-]+$/);

    // Anyone, signed out, can check it.
    const visitor = await (await browser.newContext()).newPage();
    const path = new URL(publicUrl).pathname;
    await visitor.goto(`/en${path}`);
    await expect(visitor.getByTestId("certificate-check")).toHaveAttribute("data-status", "valid");
    await expect(visitor.getByTestId("certificate-check-student")).toHaveText("Demo Student Four");
    await visitor.goto("/en/cert/not-a-real-code");
    await expect(visitor.getByTestId("certificate-check")).toHaveAttribute(
      "data-status",
      "unknown",
    );

    // Revoked: the check says so.
    await page.goto("/en/reports/graduates");
    await row.getByTestId("certificate-revoke").click();
    await page.getByRole("button", { name: "Revoke" }).last().click();
    await expect(row.getByTestId("certificate-issue")).toBeVisible();
    await visitor.goto(`/en${path}`);
    await expect(visitor.getByTestId("certificate-check")).toHaveAttribute(
      "data-status",
      "revoked",
    );
    await visitor.context().close();
  });
});
