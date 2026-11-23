import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const OWN_PASSWORD = "Own-pass!2026";

async function signIn(page: Page, phone: string, password = PASSWORD) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today|groups)/);
}

async function apiHeaders(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

/** The centre's bot is on, with a name and a webhook secret; the server's stand-in sends nothing. */
async function setUpBot(ceo: Page, secret: string) {
  await ceo.goto("/en/settings/integrations");
  const form = ceo.getByTestId("integration-telegram");
  const enabled = form.getByRole("switch", { name: "Enabled" });
  if (!(await enabled.isChecked())) await enabled.click();
  await form.getByLabel("Bot username (without @)").fill("kampus_e2e_bot");
  await form.getByLabel("Webhook secret").fill(secret);
  await form.getByTestId("telegram-save").click();
  await expect(form).toContainText("Saved");
}

/** The person presses "Share my number" in the bot: Telegram delivers their own contact. */
async function shareNumber(page: Page, secret: string, person: { id: string; phone: string }) {
  const posted = await page.request.post(`/api/v1/webhooks/telegram?secret=${secret}`, {
    data: {
      message: {
        chat: { id: Number(person.id) },
        from: { id: Number(person.id), first_name: "E2E", language_code: "en" },
        contact: { phone_number: person.phone.slice(1), user_id: Number(person.id) },
      },
    },
  });
  expect(posted.ok()).toBe(true);
}

/** Phone typed, "Get a code in Telegram" pressed: the page now waits for the code. */
async function askForCode(page: Page, path: string, phone: string) {
  await page.goto(path);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByTestId("login-get-code").click();
  await expect(page.getByTestId("phone-code-step")).toBeVisible();
}

/** With the server's stand-in for Telegram the code is the phone's last six digits. */
async function typeCode(page: Page, phone: string) {
  await page.getByLabel("Code from Telegram").fill(phone.slice(-6));
  await page.getByRole("button", { name: "Confirm" }).click();
}

test.describe("sign-in with a code from Telegram (A-196)", () => {
  test("a new staff member comes in with a code, chooses a password and uses it next time", async ({
    browser,
    page,
  }) => {
    test.skip(process.env.TELEGRAM_LOGIN_FAKE !== "1", "needs TELEGRAM_LOGIN_FAKE=1 on the server");
    const stamp = String(Date.now()).slice(-7);
    const secret = `e2e-code-${stamp}`;
    const phone = `+99894${stamp}`;
    await signIn(page, CEO_PHONE);
    await setUpBot(page, secret);

    // The manager adds the person with a phone and no password.
    const headers = await apiHeaders(page);
    const me = (await (await page.request.get("/api/v1/auth/me", { headers })).json()) as {
      branches: Array<{ id: string }>;
    };
    const created = await page.request.post("/api/v1/staff", {
      headers,
      data: {
        fullName: `E2E Code ${stamp}`,
        phone,
        gender: "FEMALE",
        roleCodes: ["CASHIER"],
        branchIds: [me.branches[0]!.id],
      },
    });
    expect(created.status()).toBe(201);

    // The sign-in page explains the Telegram way and names the bot.
    const person = await (await browser.newContext()).newPage();
    await person.goto("/en/login");
    const how = person.getByTestId("login-telegram-how");
    await expect(how).toContainText("How to sign in with Telegram");
    await expect(how).toContainText("@kampus_e2e_bot");
    await expect(person.getByTestId("login-open-bot")).toHaveAttribute(
      "href",
      "https://t.me/kampus_e2e_bot?start=login",
    );

    // The bot has never met them: the page says what to do, and a guessed code opens nothing.
    await askForCode(person, "/en/login", phone);
    await expect(person.getByTestId("code-no-message")).toContainText("Share my number");
    await typeCode(person, phone);
    await expect(person.getByTestId("code-error")).toBeVisible();

    // They share their number with the bot; the code of this sign-in arrives, and it opens.
    await shareNumber(person, secret, { id: `4${stamp}`, phone });
    await typeCode(person, phone);
    await expect(person).toHaveURL(/\/en\/set-password\?next=/);

    // Offered right away: a password of their own.
    const form = person.getByTestId("set-password-form");
    await form.getByLabel("New password", { exact: true }).fill(OWN_PASSWORD);
    await form.getByLabel("Repeat the new password").fill(OWN_PASSWORD);
    await form.getByRole("button", { name: "Save the password" }).click();
    await expect(person).toHaveURL(/\/en\/(dashboard|today)/);

    // Next time the phone and that password are enough.
    const later = await (await browser.newContext()).newPage();
    await signIn(later, phone, OWN_PASSWORD);
    const account = (await (await later.request.get("/api/v1/auth/me")).json()) as {
      user: { phone: string };
    };
    expect(account.user.phone).toBe(phone);

    // And the Telegram code still works, now without sharing again or a second offer.
    const again = await (await browser.newContext()).newPage();
    await askForCode(again, "/en/login", phone);
    await typeCode(again, phone);
    await expect(again).toHaveURL(/\/en\/(dashboard|today)/);
  });

  test("someone the centre does not know waits, a manager lets them in, and they sign in", async ({
    browser,
    page,
  }) => {
    test.skip(process.env.TELEGRAM_LOGIN_FAKE !== "1", "needs TELEGRAM_LOGIN_FAKE=1 on the server");
    const stamp = String(Date.now()).slice(-7);
    const secret = `e2e-wait-${stamp}`;
    const phone = `+99895${stamp}`;
    const name = `E2E Newcomer ${stamp}`;
    await signIn(page, CEO_PHONE);
    await setUpBot(page, secret);

    // A stranger proves their phone with the bot's code on the student page.
    const newcomer = await (await browser.newContext()).newPage();
    await shareNumber(newcomer, secret, { id: `5${stamp}`, phone });
    await askForCode(newcomer, "/en/student/login", phone);
    await typeCode(newcomer, phone);

    // Not turned away: they say who they are and wait.
    const join = newcomer.getByTestId("join-step");
    await expect(join).toContainText("You are not in Kampus yet");
    await join.getByLabel("Your full name").fill(name);
    await join.getByLabel("Branch").click();
    await newcomer.getByRole("option", { name: "Riverside" }).click();
    await join.getByLabel("Your group or teacher (optional)").fill("GE-Riverside B1");
    await join.getByRole("button", { name: "Ask to be let in" }).click();
    await expect(newcomer.getByTestId("join-sent")).toContainText("Your request is sent");
    await newcomer.goto("/en/student");
    await expect(newcomer).toHaveURL(/\/en\/student\/login/);

    // The manager sees them waiting on the Students page and lets them in as a new student.
    await page.goto("/en/students");
    await page.getByTestId("join-requests-banner").click();
    await expect(page).toHaveURL(/\/en\/join-requests/);
    const row = page.getByTestId("join-request-row").filter({ hasText: name });
    await expect(row).toContainText(phone);
    await expect(row).toContainText("GE-Riverside B1");
    await row.getByTestId("join-approve").click();
    const dialog = page.getByTestId("join-approve-dialog");
    await expect(dialog).toContainText(phone);
    await dialog.getByRole("button", { name: "Let in" }).click();
    await expect(page.getByTestId("join-request-row").filter({ hasText: name })).toHaveCount(0);
    await page.goto("/en/students");
    await page.getByPlaceholder("Search").first().fill(name);
    await expect(page.getByRole("link", { name })).toBeVisible();

    // The same phone now signs in, is offered a password, and may leave it for later.
    await askForCode(newcomer, "/en/student/login", phone);
    await typeCode(newcomer, phone);
    await expect(newcomer).toHaveURL(/\/en\/student\/set-password/);
    await newcomer.getByTestId("set-password-later").click();
    await expect(newcomer).toHaveURL(/\/en\/student$/);
    await expect(newcomer.getByTestId("student-profile")).toContainText(name);

    // From the student home they choose one after all, and then sign in with it.
    await newcomer.getByTestId("student-password-link").click();
    const form = newcomer.getByTestId("set-password-form");
    await form.getByLabel("New password", { exact: true }).fill(OWN_PASSWORD);
    await form.getByLabel("Repeat the new password").fill(OWN_PASSWORD);
    await form.getByRole("button", { name: "Save the password" }).click();
    await expect(newcomer).toHaveURL(/\/en\/student$/);
    await newcomer.getByTestId("student-sign-out").click();
    await expect(newcomer).toHaveURL(/\/en\/student\/login/);
    await newcomer.getByLabel("Phone number").fill(phone);
    await newcomer.getByLabel("Password").fill(OWN_PASSWORD);
    await newcomer.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(newcomer).toHaveURL(/\/en\/student$/);
  });
});
