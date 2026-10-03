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

test.describe("settings", () => {
  test("CEO lands on general settings, toggles a switch and the change persists", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/en\/settings\/general/);
    await expect(page.getByRole("heading", { name: "Center settings" })).toBeVisible();

    const toggle = page.getByTestId("switch-attendanceComments");
    const before = (await toggle.getAttribute("data-state")) === "checked";
    await toggle.click();
    await page.getByTestId("org-save").click();
    await expect(page.getByTestId("org-saved")).toBeVisible();

    await page.reload();
    const after =
      (await page.getByTestId("switch-attendanceComments").getAttribute("data-state")) ===
      "checked";
    expect(after).toBe(!before);

    // Put it back so the seed state is stable for other runs.
    await page.getByTestId("switch-attendanceComments").click();
    await page.getByTestId("org-save").click();
    await expect(page.getByTestId("org-saved")).toBeVisible();
  });

  test("CEO adds a room and sees it in the list, then deletes it", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/rooms");
    const name = `E2E room ${Date.now()}`;

    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("room-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Capacity").fill("17");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("room-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("17");

    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(row).toHaveCount(0);
  });

  test("shows a validation message from the server for a duplicate school", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/schools");
    const name = `E2E school ${Date.now()}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByTestId("add-button").click();
      const dialog = page.getByTestId("school-dialog");
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByRole("button", { name: "Save" }).click();
      if (attempt === 0) await expect(dialog).toBeHidden();
    }
    const dialog = page.getByTestId("school-dialog");
    await expect(dialog).toContainText("This value is already in use.");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    const row = page.getByTestId("school-row").filter({ hasText: name });
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(row).toHaveCount(0);
  });

  test("admin sees courses for their branch only and cannot open general settings", async ({
    page,
  }) => {
    await signIn(page, ADMIN_PHONE);
    await page.goto("/en/settings");
    await expect(page).toHaveURL(/\/en\/settings\/courses/);
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

    const rows = page.getByTestId("course-row");
    await expect(rows.first()).toBeVisible();
    const branches = await rows.locator("td:nth-child(2)").allInnerTexts();
    expect(new Set(branches)).toEqual(new Set(["Central"]));

    await expect(
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "General settings" }),
    ).toHaveCount(0);
    await page.goto("/en/settings/general");
    await expect(page.getByText("No access")).toBeVisible();
  });

  test("teacher is refused by the API and the page", async ({ page, request }) => {
    await signIn(page, TEACHER_PHONE);
    await page.goto("/en/settings/rooms");
    await expect(page.getByText("No access")).toBeVisible();

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csrf = cookies.find((c) => c.name === "kampus_csrf")?.value ?? "";
    const response = await request.post("/api/v1/rooms", {
      headers: { cookie: cookieHeader, "x-csrf-token": csrf, "content-type": "application/json" },
      data: { branchId: "x", name: "Hack", capacity: 1 },
    });
    expect(response.status()).toBe(403);
  });
});
