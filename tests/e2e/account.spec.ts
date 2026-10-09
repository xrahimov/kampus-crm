import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const NAME = `E2E Account ${STAMP}`;
const PHONE = `+9989${String(STAMP).slice(-8)}`;
const TEMPORARY = "Temporary-pass-1";
const OWN = "My-own-password-2";

async function signIn(page: Page, phone: string, password: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function apiHeaders(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

test.describe("account safety", () => {
  test("a new staff member picks their own password, then manages their devices", async ({
    page,
    browser,
  }) => {
    await signIn(page, CEO_PHONE, PASSWORD);
    await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
    const headers = await apiHeaders(page);
    const me = (await (await page.request.get("/api/v1/auth/me")).json()) as {
      branches: Array<{ id: string }>;
    };
    const created = await page.request.post("/api/v1/staff", {
      headers,
      data: {
        fullName: NAME,
        phone: PHONE,
        gender: "FEMALE",
        roleCodes: ["CASHIER"],
        branchIds: [me.branches[0]!.id],
        password: TEMPORARY,
      },
    });
    expect(created.status()).toBe(201);
    const staff = (await created.json()) as { id: string; mustChangePassword: boolean };
    expect(staff.mustChangePassword).toBe(true);

    // The staff list marks the temporary password; the form has the safety section.
    await page.goto("/en/settings/staff");
    const row = page.getByTestId("staff-row").filter({ hasText: NAME });
    await expect(row.getByTestId("temporary-password")).toBeVisible();
    await row.getByRole("button", { name: `Actions for ${NAME}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const safety = page.getByTestId("staff-safety");
    await expect(safety).toBeVisible();
    await expect(safety.getByTestId("staff-sign-in-code")).toBeDisabled();
    await expect(safety.getByTestId("staff-sign-out-all")).toBeEnabled();
    await page.keyboard.press("Escape");

    // The newcomer signs in from their own browser and lands on the change-password page.
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    await signIn(them, PHONE, TEMPORARY);
    await expect(them).toHaveURL(/\/en\/change-password/);
    await them.goto("/en/groups");
    await expect(them).toHaveURL(/\/en\/change-password/);
    const api = await them.request.get("/api/v1/groups");
    expect(api.status()).toBe(403);

    const form = them.getByTestId("password-form");
    await form.getByLabel("Current password").fill("not-the-password");
    await form.getByLabel("New password", { exact: true }).fill(OWN);
    await form.getByLabel("Repeat the new password").fill(OWN);
    await form.getByRole("button", { name: "Save the password" }).click();
    await expect(form).toContainText("The current password is wrong.");

    await form.getByLabel("Current password").fill(TEMPORARY);
    await form.getByLabel("Repeat the new password").fill("something-else-3");
    await form.getByRole("button", { name: "Save the password" }).click();
    await expect(form).toContainText("The passwords do not match.");

    await form.getByLabel("Repeat the new password").fill(OWN);
    await form.getByRole("button", { name: "Save the password" }).click();
    await expect(them).toHaveURL(/\/en\/(dashboard|today)/);

    // My account: one device, this one; the Telegram switch waits for a linked chat.
    await them.getByTestId("user-menu").click();
    await them.getByTestId("menu-account").click();
    await expect(them).toHaveURL(/\/en\/account/);
    await expect(them.getByTestId("account-title")).toHaveText("My account");
    await expect(them.getByTestId("session-row")).toHaveCount(1);
    await expect(them.getByTestId("session-current")).toBeVisible();
    await expect(them.getByTestId("sign-in-code")).toBeDisabled();
    await expect(them.getByTestId("sign-out-others")).toBeDisabled();

    // A second device signs in with the new password; "everywhere else" ends it.
    const second = await browser.newContext();
    const other = await second.newPage();
    await signIn(other, PHONE, OWN);
    await expect(other).toHaveURL(/\/en\/(dashboard|today)/);
    await them.reload();
    await expect(them.getByTestId("session-row")).toHaveCount(2);
    await them.getByTestId("sign-out-others").click();
    await expect(them.getByTestId("signed-out-others")).toContainText(
      "One other device was signed out.",
    );
    await expect(them.getByTestId("session-row")).toHaveCount(1);
    await other.goto("/en/groups");
    await expect(other).toHaveURL(/\/en\/login/);

    // The CEO no longer sees the temporary-password badge.
    await page.goto("/en/settings/staff");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("temporary-password")).toHaveCount(0);

    // Clean up: the test account is archived.
    const archived = await page.request.delete(`/api/v1/staff/${staff.id}`, { headers });
    expect(archived.status()).toBe(204);
    await theirs.close();
    await second.close();
  });
});
