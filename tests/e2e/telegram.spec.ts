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

test.describe("Telegram for students", () => {
  test("a student connects a chat from their page through the bot's /start code", async ({
    browser,
  }) => {
    const stamp = String(Date.now()).slice(-8);
    const secret = `e2e-${stamp}`;
    const ceoContext = await browser.newContext();
    const ceo = await ceoContext.newPage();
    await signIn(ceo, CEO_PHONE);

    // The centre names its bot and turns the integration on.
    await ceo.goto("/en/settings/integrations");
    const form = ceo.getByTestId("integration-telegram");
    if (!(await form.getByRole("switch").isChecked())) await form.getByRole("switch").click();
    await form.getByLabel("Bot username (without @)").fill("kampus_e2e_bot");
    await form.getByLabel("Webhook secret").fill(secret);
    await form.getByTestId("telegram-save").click();
    await expect(form).toContainText("Saved");

    await ceo.goto("/en/groups");
    await ceo.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(ceo.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = ceo.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const links = await ceo.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;

    // The student's page offers the connect link, which carries their code.
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    const connect = student.getByTestId("telegram-connect");
    await expect(connect).toBeVisible();
    const href = (await connect.getAttribute("href"))!;
    expect(href).toMatch(/^https:\/\/t\.me\/kampus_e2e_bot\?start=/);
    const code = href.split("start=")[1]!;

    // Telegram delivers the /start to the webhook; the chat is linked.
    const chatId = `7${stamp}`;
    const posted = await student.request.post(`/api/v1/webhooks/telegram?secret=${secret}`, {
      data: {
        message: {
          chat: { id: Number(chatId) },
          from: { first_name: "E2E Parent", language_code: "en" },
          text: `/start ${code}`,
        },
      },
    });
    expect(posted.ok()).toBe(true);
    await student.reload();
    const card = student.getByTestId("portal-telegram");
    await expect(card).toContainText("Connected: E2E Parent");
    await expect(card.getByTestId("telegram-connect")).toContainText("Connect another phone");

    // And can be removed again from the page.
    await card.getByRole("button", { name: "Disconnect" }).click();
    await expect(card).not.toContainText("E2E Parent");

    // Leave the integration off, as the seed has it.
    await ceo.goto("/en/settings/integrations");
    const again = ceo.getByTestId("integration-telegram");
    await again.getByRole("switch").click();
    await again.getByTestId("telegram-save").click();
    await expect(again).toContainText("Saved");
  });
});
