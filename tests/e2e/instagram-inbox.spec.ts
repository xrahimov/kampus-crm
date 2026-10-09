import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

/** Instagram direct messages in the lead inbox (A-148), through Meta's webhook shape. */
test.describe("Instagram lead inbox", () => {
  test("Meta's handshake is answered and a direct message becomes a lead answered from the inbox", async ({
    page,
    request,
  }) => {
    const stamp = String(Date.now()).slice(-8);
    const secret = `e2e-ig-${stamp}`;
    const verifyToken = `verify-${stamp}`;
    const senderId = `17${stamp}`;
    await signIn(page, CEO_PHONE);

    // The centre turns the integration on with its webhook secret and verify token.
    await page.goto("/en/settings/integrations");
    const form = page.getByTestId("integration-instagram");
    const enabled = form.getByRole("switch", { name: "Enabled" });
    if (!(await enabled.isChecked())) await enabled.click();
    await form.getByLabel("Webhook secret").fill(secret);
    await form.getByLabel("Verify token").fill(verifyToken);
    await form.getByLabel("App secret").fill("");
    await form.getByTestId("instagram-save").click();
    await expect(form).toContainText("Saved");

    // Meta's subscription handshake echoes the challenge only with the right token.
    const ok = await request.get(
      `/api/v1/webhooks/instagram?secret=${secret}&hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=4242`,
    );
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toBe("4242");
    const wrong = await request.get(
      `/api/v1/webhooks/instagram?secret=${secret}&hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`,
    );
    expect(wrong.status()).toBe(403);

    // A direct message arrives in Meta's delivery shape.
    const deliver = (text: string, mid: string) =>
      request.post(`/api/v1/webhooks/instagram?secret=${secret}`, {
        headers: { "content-type": "application/json" },
        data: {
          object: "instagram",
          entry: [
            {
              id: "90000",
              time: Date.now(),
              messaging: [
                {
                  sender: { id: senderId },
                  recipient: { id: "90000" },
                  timestamp: Date.now(),
                  message: { mid, text },
                },
              ],
            },
          ],
        },
      });
    expect((await deliver("Hello from Instagram! Do you teach IELTS?", `m-${stamp}-1`)).ok()).toBe(
      true,
    );
    expect((await deliver(`My number ${"+99891" + stamp.slice(0, 7)}`, `m-${stamp}-2`)).ok()).toBe(
      true,
    );

    // The chat is in the inbox, marked Instagram and unread; the manager answers.
    await page.goto("/en/leads/inbox");
    const row = page.getByTestId("inbox-conversation").filter({ hasText: `Instagram ${senderId}` });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("inbox-channel")).toHaveText("Instagram");
    await expect(row.getByTestId("inbox-unread")).toHaveText("2");
    await row.click();
    await expect(page.getByTestId("inbox-message")).toHaveCount(2);
    await page.getByTestId("inbox-reply").fill("Yes, the next IELTS group starts on Monday.");
    await page.getByTestId("inbox-send").click();
    await expect(page.getByTestId("inbox-message")).toHaveCount(3);
    await expect(page.getByTestId("inbox-message").last()).toHaveAttribute("data-direction", "OUT");

    // Off again, as it was.
    await page.goto("/en/settings/integrations");
    const again = page
      .getByTestId("integration-instagram")
      .getByRole("switch", { name: "Enabled" });
    if (await again.isChecked()) await again.click();
    await page.getByTestId("instagram-save").click();
    await expect(page.getByTestId("integration-instagram")).toContainText("Saved");
  });
});
