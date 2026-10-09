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

test.describe("Telegram lead inbox", () => {
  test("a stranger's message to the bot becomes a lead and is answered from the inbox", async ({
    page,
  }) => {
    const stamp = String(Date.now()).slice(-8);
    const secret = `e2e-inbox-${stamp}`;
    const name = `E2E Prospect ${stamp}`;
    await signIn(page, CEO_PHONE);

    // The centre names its bot and turns the integration on.
    await page.goto("/en/settings/integrations");
    const form = page.getByTestId("integration-telegram");
    const enabled = form.getByRole("switch", { name: "Enabled" });
    if (!(await enabled.isChecked())) await enabled.click();
    await form.getByLabel("Bot username (without @)").fill("kampus_e2e_bot");
    await form.getByLabel("Webhook secret").fill(secret);
    await form.getByTestId("telegram-save").click();
    await expect(form).toContainText("Saved");

    // The inbox shows the link prospective students press.
    await page.goto("/en/leads/inbox");
    await expect(page.getByTestId("inbox-link")).toHaveAttribute(
      "href",
      /^https:\/\/t\.me\/kampus_e2e_bot\?start=lead-/,
    );

    // Telegram delivers a stranger's message; the webhook files a lead and a chat.
    const chatId = Number(`8${stamp}`);
    const say = (text: string) =>
      page.request.post(`/api/v1/webhooks/telegram?secret=${secret}`, {
        data: {
          message: {
            message_id: Date.now(),
            chat: { id: chatId },
            from: {
              first_name: "E2E Prospect",
              last_name: stamp,
              username: `e2e_${stamp}`,
              language_code: "en",
            },
            text,
          },
        },
      });
    expect((await say("Hi! Do you have an IELTS course?")).ok()).toBe(true);
    expect((await say(`My number is +99890${stamp.slice(0, 7)}`)).ok()).toBe(true);

    await page.goto("/en/leads");
    await expect(page.getByTestId("leads-inbox")).toContainText(/Inbox \([1-9]\d*\)/);
    await page.getByTestId("leads-inbox").click();
    await expect(page).toHaveURL(/\/en\/leads\/inbox/);
    const row = page.getByTestId("inbox-conversation").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-unread", "true");
    await expect(row.getByTestId("inbox-unread")).toHaveText("2");
    // Nothing is open until the reader picks a chat; opening it marks it read.
    await expect(page.getByTestId("inbox-messages")).toHaveCount(0);
    await row.click();
    await expect(page.getByTestId("inbox-title")).toHaveText(name);
    const messages = page.getByTestId("inbox-message");
    await expect(messages).toHaveCount(2);
    await expect(messages.first()).toContainText("Do you have an IELTS course?");
    await expect(row).toHaveAttribute("data-unread", "false");

    // The manager answers; the reply sits in the chat as sent.
    await page.getByTestId("inbox-reply").fill("Yes! Classes start on Monday.");
    await page.getByTestId("inbox-send").click();
    await expect(messages).toHaveCount(3);
    await expect(messages.last()).toHaveAttribute("data-direction", "OUT");
    await expect(messages.last()).toContainText("Yes! Classes start on Monday.");

    // The lead is on the board with the Telegram source and the phone from the chat.
    await page.getByTestId("inbox-open-lead").click();
    await expect(page).toHaveURL(/\/en\/leads\?board=/);
    const card = page.getByTestId("lead-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Telegram");
    await expect(card).toContainText(`+99890${stamp.slice(0, 7)}`);

    // Closing hides the chat from the open list.
    await page.goto("/en/leads/inbox");
    await page.getByTestId("inbox-conversation").filter({ hasText: name }).click();
    await page.getByTestId("inbox-close").click();
    await expect(page.getByTestId("inbox-conversation").filter({ hasText: name })).toHaveCount(0);
    await page.getByTestId("inbox-status-closed").click();
    await expect(page.getByTestId("inbox-conversation").filter({ hasText: name })).toBeVisible();

    // Leave the integration off, as the seed has it.
    await page.goto("/en/settings/integrations");
    const again = page.getByTestId("integration-telegram");
    await again.getByRole("switch", { name: "Enabled" }).click();
    await again.getByTestId("telegram-save").click();
    await expect(again).toContainText("Saved");
  });
});
