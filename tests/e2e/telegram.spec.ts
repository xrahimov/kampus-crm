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
    const enabled = form.getByRole("switch", { name: "Enabled" });
    if (!(await enabled.isChecked())) await enabled.click();
    await form.getByLabel("Bot username (without @)").fill("kampus_e2e_bot");
    await form.getByLabel("Webhook secret").fill(secret);
    // The Sunday report to parents (A-118) is on by default and can be switched off.
    const weekly = form.getByRole("switch", { name: "Weekly report to parents on Sunday evening" });
    await expect(weekly).toBeChecked();
    await weekly.click();
    await form.getByTestId("telegram-save").click();
    await expect(form).toContainText("Saved");
    await ceo.reload();
    await expect(
      ceo
        .getByTestId("integration-telegram")
        .getByRole("switch", { name: "Weekly report to parents on Sunday evening" }),
    ).not.toBeChecked();

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

    // Two-way (A-119): the linked chat asks for its balance and reports today's absence.
    const say = (text: string) =>
      student.request.post(`/api/v1/webhooks/telegram?secret=${secret}`, {
        data: {
          message: {
            chat: { id: Number(chatId) },
            from: { first_name: "E2E Parent", language_code: "en" },
            text,
          },
        },
      });
    expect((await say("Balance")).ok()).toBe(true);
    // An extra lesson today, so there is something to be absent from; its time
    // follows the stamp so a re-run on the same day adds another one.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const hour = 8 + (Number(stamp) % 11);
    const start = `${String(hour).padStart(2, "0")}:${String(Number(stamp.slice(-2)) % 60).padStart(2, "0")}`;
    const cookies = await ceoContext.cookies();
    const extra = await ceo.request.post(`/api/v1/groups/${groupId}/lessons/extra`, {
      headers: {
        cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
        "content-type": "application/json",
      },
      data: { date: today, startTime: start, endTime: `${String(hour + 1).padStart(2, "0")}:00` },
    });
    expect(extra.status()).toBe(201);
    expect((await say("Absent today: dentist")).ok()).toBe(true);
    // The teacher's Today screen shows the excused mark with the parent's reason.
    await ceo.goto("/en/today");
    const chip = ceo.getByTestId("today-member").filter({ hasText: first!.fullName }).first();
    await expect(chip).toHaveAttribute("data-status", "EXCUSED");
    await expect(chip.getByTestId("today-member-comment")).toHaveText("Via Telegram: dentist");

    // And can be removed again from the page.
    await card.getByRole("button", { name: "Disconnect" }).click();
    await expect(card).not.toContainText("E2E Parent");

    // Leave the integration off, as the seed has it.
    await ceo.goto("/en/settings/integrations");
    const again = ceo.getByTestId("integration-telegram");
    await again.getByRole("switch", { name: "Enabled" }).click();
    await again.getByRole("switch", { name: "Weekly report to parents on Sunday evening" }).click();
    await again.getByTestId("telegram-save").click();
    await expect(again).toContainText("Saved");
  });
});
