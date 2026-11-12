import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

/**
 * Telegram's consent screen, played by the test: the button's start URL
 * answers with a redirect to Telegram; the test reads it and comes back to
 * Kampus' callback with a code naming this person (TELEGRAM_LOGIN_FAKE=1).
 */
async function telegramLogin(page: Page, person: { id: string; name: string; phone: string }) {
  const start = await page.getByTestId("login-telegram").getAttribute("href");
  const res = await page.request.get(start!, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const auth = new URL(res.headers()["location"]!);
  expect(auth.origin).toBe("https://oauth.telegram.org");
  const back = new URL(auth.searchParams.get("redirect_uri")!);
  // Staff come back to the address BotFather already has for students.
  expect(back.pathname).toBe("/api/v1/student-auth/telegram/callback");
  back.searchParams.set("state", auth.searchParams.get("state")!);
  const claims = { id: person.id, name: person.name, phone_number: person.phone };
  back.searchParams.set(
    "code",
    `fake.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`,
  );
  await page.goto(back.toString());
}

/** The centre's bot gets the login keys, saved by the CEO from a password session. */
async function saveLoginKeys(page: Page, stamp: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(CEO_PHONE);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
  await page.goto("/en/settings/integrations");
  const form = page.getByTestId("integration-telegram");
  const enabled = form.getByRole("switch", { name: "Enabled" });
  if (!(await enabled.isChecked())) await enabled.click();
  await form.getByLabel("Telegram login: Client ID").fill("123456");
  await form.getByLabel("Telegram login: Client Secret").fill(`secret-${stamp}`);
  await form.getByTestId("telegram-save").click();
  await expect(form).toContainText("Saved");
}

test.describe("staff sign-in with Telegram (A-180)", () => {
  test("a staff member's Telegram phone signs them in, a stranger's does not", async ({
    browser,
    page,
  }) => {
    test.skip(process.env.TELEGRAM_LOGIN_FAKE !== "1", "needs TELEGRAM_LOGIN_FAKE=1 on the server");
    const stamp = String(Date.now()).slice(-7);

    // The centre's bot has the login keys.
    await saveLoginKeys(page, stamp);

    // The switch to Telegram only is there, and refuses a password session.
    await page.goto("/en/settings/general");
    const signIn = page.getByTestId("staff-sign-in");
    await signIn.getByRole("switch", { name: "Staff sign in with Telegram only" }).click();
    await page.getByTestId("org-save").click();
    await expect(page.getByText("Sign out and sign in with Telegram first")).toBeVisible();

    // A stranger's Telegram number gets nowhere.
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto("/en/login");
    await telegramLogin(stranger, { id: `8${stamp}`, name: "Stranger", phone: "998000000009" });
    await expect(stranger).toHaveURL(/\/en\/login\?error=staffTelegramUnknown/);
    await expect(stranger.getByTestId("login-telegram-error")).toContainText("No staff member");
    await stranger.goto("/en/groups");
    await expect(stranger).toHaveURL(/\/en\/login/);

    // The teacher's own number opens the teacher's account, on the page asked for.
    const teacher = await (await browser.newContext()).newPage();
    await teacher.goto("/en/groups");
    await expect(teacher).toHaveURL(/\/en\/login\?next=%2Fgroups/);
    await telegramLogin(teacher, {
      id: `6${stamp}`,
      name: "Teacher",
      phone: TEACHER_PHONE.slice(1),
    });
    await expect(teacher).toHaveURL(/\/en\/groups$/);
    const me = (await (await teacher.request.get("/api/v1/auth/me")).json()) as {
      user: { phone: string };
    };
    expect(me.user.phone).toBe(TEACHER_PHONE);
  });

  test("the site owner switches every centre to Telegram only, and back (A-181)", async ({
    browser,
    page,
  }) => {
    test.skip(process.env.TELEGRAM_LOGIN_FAKE !== "1", "needs TELEGRAM_LOGIN_FAKE=1 on the server");
    const stamp = String(Date.now()).slice(-7);
    await saveLoginKeys(page, stamp);

    // The site owner comes in through Telegram: only then may the rule be switched on.
    const owner = await (await browser.newContext()).newPage();
    await owner.goto("/en/login");
    await telegramLogin(owner, { id: `5${stamp}`, name: "Owner", phone: CEO_PHONE.slice(1) });
    await expect(owner).toHaveURL(/\/en\/(dashboard|today)/);

    const signIn = owner.getByTestId("staff-sign-in");
    const all = signIn.getByRole("switch", {
      name: "Every centre on this server signs in with Telegram only",
    });
    const own = signIn.getByRole("switch", { name: "Staff sign in with Telegram only" });
    const visitor = await (await browser.newContext()).newPage();
    try {
      await owner.goto("/en/settings/general");
      await all.click();
      // The rule for every centre includes this one.
      await expect(own).toBeChecked();
      await expect(own).toBeDisabled();
      await owner.getByTestId("org-save").click();
      await expect(owner.getByTestId("org-saved")).toBeVisible();

      // The sign-in page has the Telegram button and nothing else.
      await visitor.goto("/en/login");
      await expect(visitor.getByTestId("login-telegram-only")).toBeVisible();
      await expect(visitor.getByLabel("Password")).toHaveCount(0);
      // A right password sent past the page is refused all the same.
      const refused = await visitor.request.post("/api/v1/auth/login", {
        data: { phone: TEACHER_PHONE, password: PASSWORD },
      });
      expect(refused.status()).toBe(403);
    } finally {
      // Back to passwords, whatever happened above: the other tests sign in with one.
      await owner.goto("/en/settings/general");
      if (await all.isChecked()) await all.click();
      if (await own.isChecked()) await own.click();
      if (await owner.getByTestId("org-save").isEnabled()) {
        await owner.getByTestId("org-save").click();
        await expect(owner.getByTestId("org-saved")).toBeVisible();
      }
    }
    await visitor.goto("/en/login");
    await expect(visitor.getByLabel("Password")).toBeVisible();
    await expect(visitor.getByTestId("login-telegram")).toBeVisible();
  });
});
