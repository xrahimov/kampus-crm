import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const ADMIN_PHONE = "+998900000002";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

/** +998 + 9 digits, unique per run. */
const freshPhone = () => `+99890${String(Date.now() % 10_000_000).padStart(7, "0")}`;

test.describe("teachers", () => {
  test("CEO adds a teacher, opens the profile, then archives it", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Teachers" })
      .click();
    await expect(page).toHaveURL(/\/en\/teachers/);
    await expect(page.getByRole("heading", { name: "Teachers" })).toBeVisible();
    await expect(
      page.getByTestId("teacher-row").filter({ hasText: "Demo Teacher" }).first(),
    ).toBeVisible();

    await page.getByTestId("tab-support").click();
    await expect(page).toHaveURL(/tab=support/);
    await expect(
      page.getByTestId("teacher-row").filter({ hasText: "Demo Support Teacher" }),
    ).toBeVisible();
    await page.getByTestId("tab-teachers").click();

    const name = `E2E Teacher ${Date.now()}`;
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("staff-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Full name").fill(name);
    await dialog.getByLabel("Phone number").fill(freshPhone());
    await dialog.getByTestId("salary-PER_LESSON").click();
    await dialog.getByLabel("Fee per lesson (UZS)").fill("120000");
    await dialog.getByRole("button", { name: "Generate" }).click();
    await expect(dialog.getByLabel("Password", { exact: true })).not.toHaveValue("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("teacher-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("120,000");

    await row.getByRole("link", { name }).click();
    await expect(page).toHaveURL(/\/en\/teachers\/[a-z0-9]+/);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("Per lesson", { exact: true })).toBeVisible();
    await expect(page.getByText("Groups arrive in phase 5.")).toBeVisible();

    await page.goBack();
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(row).toHaveCount(0);

    await page.getByLabel("Archived").click();
    await expect(page).toHaveURL(/archived=true/);
    await expect(page.getByTestId("teacher-row").filter({ hasText: name })).toBeVisible();
  });

  test("admin sees staff for their branch only and can filter by role", async ({ page }) => {
    await signIn(page, ADMIN_PHONE);
    await page.goto("/en/settings/staff");
    await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible();

    await page.getByRole("button", { name: /^Teacher \d+$/ }).click();
    await expect(page).toHaveURL(/role=TEACHER/);
    const rows = page.getByTestId("staff-row");
    await expect(rows.first()).toBeVisible();
    const names = await rows.locator("td:nth-child(1)").allInnerTexts();
    expect(names.join(" ")).toContain("Demo Teacher");
    expect(names.join(" ")).not.toContain("Demo Teacher Two");
    const branches = await rows.locator("td:nth-child(6)").allInnerTexts();
    for (const b of branches) expect(b).toContain("Central");

    // Roles are the CEO's business.
    await page.goto("/en/settings/roles");
    await expect(page.getByText("No access")).toBeVisible();
  });

  test("CEO creates a custom role with one permission and deletes it", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/roles");
    await expect(page.getByTestId("role-row").filter({ hasText: "CEO" })).toBeVisible();

    const name = `E2E role ${Date.now()}`;
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("role-dialog");
    await dialog.getByLabel("Role name").fill(name);
    await dialog.getByTestId("perm-leads.view").click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("role-row").filter({ hasText: name });
    await expect(row).toContainText("1 permission");
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(row).toHaveCount(0);
  });

  test("teacher is refused by the teachers page and API", async ({ page, request }) => {
    await signIn(page, TEACHER_PHONE);
    await page.goto("/en/teachers");
    await expect(page.getByText("No access")).toBeVisible();

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csrf = cookies.find((c) => c.name === "kampus_csrf")?.value ?? "";
    const response = await request.post("/api/v1/teachers", {
      headers: { cookie: cookieHeader, "x-csrf-token": csrf, "content-type": "application/json" },
      data: {
        fullName: "Hack",
        phone: "+998900009999",
        roleCodes: ["TEACHER"],
        branchIds: ["x"],
        password: "Secret!2026",
      },
    });
    expect(response.status()).toBe(403);
  });
});
