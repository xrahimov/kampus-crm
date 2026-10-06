import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups)/);
}

test.describe("online payments", () => {
  test("a student pays through Payme from their page and the payment appears", async ({
    browser,
  }) => {
    const stamp = String(Date.now()).slice(-8);
    const key = `e2e-payme-${stamp}`;
    const ceoContext = await browser.newContext();
    const ceo = await ceoContext.newPage();
    await signIn(ceo, CEO_PHONE);

    // The centre switches Payme on with its cashbox.
    await ceo.goto("/en/settings/integrations");
    const form = ceo.getByTestId("integration-payme");
    if (!(await form.getByRole("switch").isChecked())) await form.getByRole("switch").click();
    await form.getByLabel("Merchant ID (cashbox)").fill("e2e-cashbox");
    await form.getByLabel("Merchant key").fill(key);
    await form.getByTestId("payme-save").click();
    await expect(form).toContainText("Saved");

    await ceo.goto("/en/groups");
    await ceo.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(ceo.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = ceo.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const links = await ceo.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;

    // The student picks an amount and is sent to Payme's checkout with the order id.
    const student = await (await browser.newContext()).newPage();
    await student.route("https://checkout.paycom.uz/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>Payme</title>" }),
    );
    await student.goto(`/en/class/${first!.token}`);
    await student.getByRole("tab", { name: "Payments" }).click();
    const pay = student.getByTestId("portal-pay");
    await expect(pay).toBeVisible();
    await pay.getByTestId("pay-amount").fill("150000");
    await pay.getByTestId("pay-payme").click();
    await student.waitForURL(/^https:\/\/checkout\.paycom\.uz\//);
    const encoded = student.url().slice("https://checkout.paycom.uz/".length);
    const params = Buffer.from(encoded, "base64").toString("utf8");
    expect(params).toContain("m=e2e-cashbox");
    expect(params).toContain("a=15000000");
    const orderId = params.match(/ac\.order_id=([a-z0-9]+)/)![1]!;
    const returnUrl = params.match(/c=(\S+)$/)![1]!;

    // Payme's Merchant API confirms the payment.
    const auth = `Basic ${Buffer.from(`Paycom:${key}`).toString("base64")}`;
    const rpc = async (method: string, params: Record<string, unknown>) => {
      const r = await ceo.request.post("/api/v1/webhooks/payme", {
        headers: { Authorization: auth },
        data: { id: 1, method, params },
      });
      return (await r.json()) as { result?: Record<string, unknown>; error?: unknown };
    };
    const trx = `e2e-trx-${stamp}`;
    expect(
      (await rpc("CheckPerformTransaction", { amount: 15_000_000, account: { order_id: orderId } }))
        .result,
    ).toEqual({ allow: true });
    expect(
      (
        await rpc("CreateTransaction", {
          id: trx,
          time: Date.now(),
          amount: 15_000_000,
          account: { order_id: orderId },
        })
      ).result,
    ).toMatchObject({ state: 1 });
    expect((await rpc("PerformTransaction", { id: trx })).result).toMatchObject({ state: 2 });

    // Back on their page the student sees the confirmation and the new payment.
    await student.goto(returnUrl.replace(/^https?:\/\/[^/]+/, ""));
    await expect(student.getByTestId("pay-outcome")).toContainText("was received", {
      timeout: 15_000,
    });
    await expect(student.getByTestId("portal")).toContainText("Payme");

    // Switch Payme off again, as the seed has it.
    await ceo.goto("/en/settings/integrations");
    const again = ceo.getByTestId("integration-payme");
    if (await again.getByRole("switch").isChecked()) await again.getByRole("switch").click();
    await again.getByTestId("payme-save").click();
    await expect(again).toContainText("Saved");
    await ceoContext.close();
  });
});
