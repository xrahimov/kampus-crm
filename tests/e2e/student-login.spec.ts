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

/**
 * Telegram's consent screen, played by the test without leaving Kampus: the
 * login button's start URL answers with a redirect to Telegram; the test reads
 * it and comes back to Kampus' callback with a code naming this person (the
 * server's fake provider, TELEGRAM_LOGIN_FAKE=1, turns the code into claims).
 */
async function telegramLogin(page: Page, person: { id: string; name: string; phone: string }) {
  const start = await page.getByTestId("student-login-telegram").getAttribute("href");
  const res = await page.request.get(start!, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const auth = new URL(res.headers()["location"]!);
  expect(auth.origin).toBe("https://oauth.telegram.org");
  const back = new URL(auth.searchParams.get("redirect_uri")!);
  back.searchParams.set("state", auth.searchParams.get("state")!);
  const claims = { id: person.id, name: person.name, phone_number: person.phone };
  back.searchParams.set(
    "code",
    `fake.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`,
  );
  await page.goto(back.toString());
}

test.describe("student sign-in with Telegram (A-150)", () => {
  test("a student whose phone the centre has signs in, a stranger cannot, staff sign them out", async ({
    browser,
    page,
  }) => {
    test.skip(process.env.TELEGRAM_LOGIN_FAKE !== "1", "needs TELEGRAM_LOGIN_FAKE=1 on the server");
    await signIn(page, CEO_PHONE);
    const stamp = String(Date.now()).slice(-7);

    // The centre enters the bot's Login Widget credentials.
    await page.goto("/en/settings/integrations");
    const form = page.getByTestId("integration-telegram");
    const enabled = form.getByRole("switch", { name: "Enabled" });
    if (!(await enabled.isChecked())) await enabled.click();
    await form.getByLabel("Telegram login: Client ID").fill("123456");
    await form.getByLabel("Telegram login: Client Secret").fill(`secret-${stamp}`);
    await form.getByTestId("telegram-save").click();
    await expect(form).toContainText("Saved");

    // A student with a phone, in a group.
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const groups = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ id: string; name: string; branchId: string }> };
    const group = groups.items.find((g) => g.name === "GE-Morning A1")!;
    const phone = `+99893${stamp}`;
    const name = `E2E Login ${stamp}`;
    const created = await page.request.post("/api/v1/students", {
      headers,
      data: {
        branchId: group.branchId,
        fullName: name,
        phone,
        gender: "FEMALE",
        membership: {
          groupId: group.id,
          joinedAt: "2026-09-01",
          customPrice: null,
          note: null,
          status: "ACTIVE",
        },
      },
    });
    expect(created.status()).toBe(201);
    const studentId = ((await created.json()) as { id: string }).id;

    // A stranger's Telegram number gets nowhere, and no account appears.
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto("/en/student/login");
    await telegramLogin(stranger, { id: `8${stamp}`, name: "Stranger", phone: "998000000009" });
    await expect(stranger).toHaveURL(/\/en\/student\/login\?error=studentNotRegistered/);
    await expect(stranger.getByTestId("student-login-error")).toContainText("not registered");
    await stranger.goto("/en/student");
    await expect(stranger).toHaveURL(/\/en\/student\/login/);

    // The student signs in and lands on their home with the group.
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    const lola = { id: `7${stamp}`, name: "Lola", phone: phone.slice(1) };
    await student.goto("/en/student/login");
    await telegramLogin(student, lola);
    await expect(student).toHaveURL(/\/en\/student$/);
    await expect(student.getByTestId("student-home-name")).toContainText("Lola");
    const profile = student.getByTestId("student-profile");
    await expect(profile).toContainText(name);
    await expect(profile.getByTestId("student-group")).toContainText("GE-Morning A1");
    await profile.getByTestId("student-open-group").click();
    await expect(student).toHaveURL(/\/en\/class\//);
    // The staff area stays closed to a student session.
    await student.goto("/en/students");
    await expect(student).toHaveURL(/\/en\/login/);

    // Staff see the access on the student's page and sign them out everywhere.
    await page.goto(`/en/students/${studentId}`);
    const card = page.getByTestId("access-card");
    await expect(card.getByTestId("access-row")).toContainText("Lola");
    await expect(card.getByTestId("access-row")).toContainText("Phone matched in Telegram");
    await card.getByTestId("access-sign-out").click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Sign out everywhere" })
      .click();
    await expect(card.getByTestId("access-row")).toContainText("signed out");
    await student.goto("/en/student");
    await expect(student).toHaveURL(/\/en\/student\/login/);

    // Signing in again works; the student signs out themselves.
    await telegramLogin(student, lola);
    await expect(student).toHaveURL(/\/en\/student$/);
    await student.getByTestId("student-sign-out").click();
    await expect(student).toHaveURL(/\/en\/student\/login/);
  });
});
