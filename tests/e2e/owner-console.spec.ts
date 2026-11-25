import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("site-owner console (A-144)", () => {
  test("shows usage, suspends and resumes a centre, exports its data", async ({ page }) => {
    const stamp = String(Date.now()).slice(-7);
    const name = `E2E Centre ${stamp}`;
    await signIn(page, CEO_PHONE);
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };

    // A centre of its own, made through the API like the dialog does.
    const created = await page.request.post("/api/v1/organizations", {
      headers,
      data: {
        name,
        branches: [`E2E Branch ${stamp}`],
        ceoFullName: `E2E Boss ${stamp}`,
        ceoPhone: `+99891${stamp}`,
        ceoPassword: "FirstPass!2026",
      },
    });
    expect(created.status()).toBe(201);
    const org = (await created.json()) as { id: string };

    await page.goto("/en/settings/organizations");
    await expect(page.getByRole("columnheader", { name: "Last sign-in" })).toBeVisible();
    const row = page.getByTestId("organization-row").filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("organization-last-sign-in")).toHaveText("never");
    await expect(row.getByTestId("organization-storage")).toHaveText("0");

    // Suspend with a reason, then resume.
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByTestId("organization-suspend").click();
    const dialog = page.getByTestId("organization-suspend-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Reason (shown to you only)").fill("e2e");
    await dialog.getByRole("button", { name: "Suspend" }).click();
    await expect(row.getByTestId("organization-suspended")).toBeVisible();
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByTestId("organization-suspend").click();
    await page
      .getByTestId("organization-suspend-dialog")
      .getByRole("button", { name: "Resume" })
      .click();
    await expect(row.getByTestId("organization-suspended")).toHaveCount(0);

    // The export is one JSON document.
    const exported = await page.request.get(`/api/v1/organizations/${org.id}/export`, {
      headers: { cookie: headers.cookie },
    });
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain("kampus-e2e-centre-");
    const data = (await exported.json()) as {
      format: string;
      organization: { name: string };
      tables: Record<string, unknown[]>;
    };
    expect(data.format).toBe("kampus-organization/1");
    expect(data.organization.name).toBe(name);
    expect(data.tables.branches).toHaveLength(1);
    expect(data.tables.users).toHaveLength(1);
  });

  test("gives a demo teacher a reviewer sign-in and takes it away (A-272)", async ({
    page,
    browser,
  }) => {
    const stamp = String(Date.now()).slice(-7);
    const name = `E2E Reviewer ${stamp}`;
    const phone = `+99897${stamp}`;
    const password = "Review!Pass2026";
    await signIn(page, CEO_PHONE);
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const me = (await (await page.request.get("/api/v1/auth/me")).json()) as {
      branches: Array<{ id: string }>;
    };
    // A teacher nobody has signed in as: made without a password, like any new staff member.
    const created = await page.request.post("/api/v1/staff", {
      headers,
      data: {
        fullName: name,
        phone,
        gender: "FEMALE",
        roleCodes: ["TEACHER"],
        branchIds: [me.branches[0]!.id],
      },
    });
    expect(created.status()).toBe(201);

    await page.goto("/en/settings/organizations");
    const card = page.getByTestId("review-sign-ins");
    await card.getByTestId("review-sign-in-add").click();
    const dialog = page.getByTestId("review-sign-in-dialog");
    await dialog.getByLabel("Phone (login)").fill(phone);
    await dialog.getByLabel("Password").fill(password);
    await dialog.getByRole("button", { name: "Save" }).click();
    const row = card.getByTestId("review-sign-in-row").filter({ hasText: name });
    await expect(row).toContainText("Staff member");
    await expect(row).toContainText(phone);

    // The reviewer signs in with that phone and password, and nothing asks for another password.
    const reviewer = await browser.newContext();
    const theirs = await reviewer.newPage();
    await theirs.goto("/en/login");
    await theirs.getByLabel("Phone number").fill(phone);
    await theirs.getByLabel("Password").fill(password);
    await theirs.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(theirs).toHaveURL(/\/en\/(dashboard|groups|today)/);

    // Removed: the row goes, and the reviewer's session with it.
    await row.getByTestId("review-sign-in-remove").click();
    await expect(row).toHaveCount(0);
    await theirs.goto("/en/today");
    await expect(theirs).toHaveURL(/\/en\/login/);
    await reviewer.close();
  });
});
