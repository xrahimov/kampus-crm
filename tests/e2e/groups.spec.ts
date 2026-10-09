import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
}

test.describe("groups", () => {
  test("CEO creates a group, adds a student, marks attendance and leaves a note", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Groups" })
      .click();
    await expect(page).toHaveURL(/\/en\/groups/);
    await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
    await expect(page.getByTestId("group-row").filter({ hasText: "GE-Morning A1" })).toBeVisible();

    const name = `E2E Group ${Date.now()}`;
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("group-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Group name").fill(name);
    await dialog.getByLabel("Course").click();
    await page.getByRole("option", { name: "IELTS Preparation" }).click();
    await dialog.getByLabel("Days").click();
    await page.getByRole("option", { name: /Odd days/ }).click();
    await dialog.getByLabel("Start date").fill("2026-09-07");
    await dialog.getByRole("button", { name: "Add teacher" }).click();
    await dialog.getByRole("combobox", { name: "Teacher" }).first().click();
    await page.getByRole("option", { name: "Demo Teacher Three" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("group-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("IELTS Preparation");
    await expect(row).toContainText("Demo Teacher Three");
    await expect(row).toContainText("Odd days");
    // IELTS Preparation lasts 4 months: 7 Sep 2026 → 7 Jan 2027.
    await expect(row).toContainText("Jan 7, 2027");

    await row.getByRole("link", { name }).click();
    await expect(page).toHaveURL(/\/en\/groups\/[a-z0-9]+/);
    await expect(page.getByTestId("group-title")).toHaveText(name);
    await expect(page.getByTestId("group-schedule")).toContainText("Monday");
    await expect(page.getByTestId("group-teachers")).toContainText("Demo Teacher Three");
    await expect(page.getByText("No students in this group.").first()).toBeVisible();

    // Add a brand-new student to the group.
    await page.getByTestId("add-member").click();
    const member = page.getByTestId("add-member-dialog");
    await member.getByLabel("New student").click();
    await member.getByLabel("Full name").fill("E2E Student");
    await member.getByLabel("Joined on").fill("2026-09-07");
    // Charged from October: September is settled elsewhere (A-110).
    await member.getByLabel("Charged from").fill("2026-10-01");
    await member.getByRole("button", { name: "Save" }).click();
    await expect(member).toBeHidden();
    const memberRow = page.getByTestId("member-row").filter({ hasText: "E2E Student" });
    await expect(memberRow).toBeVisible();
    await page.getByLabel("Join dates").click();
    await expect(memberRow).toContainText("joined Sep 7, 2026");
    await expect(memberRow).toContainText("charged from Oct 1, 2026");

    // Attendance for September: the first cell cycles to "Present".
    await page.getByTestId("month-2026-09").click();
    await expect(page).toHaveURL(/month=2026-09/);
    const grid = page.getByTestId("attendance-grid");
    await expect(grid).toBeVisible();
    const cell = grid.getByRole("button", { name: /E2E Student 2026-09-07/ });
    await expect(cell).toHaveText("·");
    await cell.click();
    await expect(cell).toHaveText("✓");
    await expect(cell).toHaveAccessibleName(/Present/);

    // Grades tab accepts a score and shows the average.
    await page.getByTestId("tab-grades").click();
    const score = page
      .getByTestId("grades-grid")
      .getByRole("spinbutton", { name: /E2E Student 2026-09-07/ });
    await score.fill("4");
    await score.blur();
    await expect(page.getByTestId("grades-grid").locator("tbody tr").first()).toContainText("4");

    // Notes and history.
    await page.getByTestId("tab-notes").click();
    await page.getByTestId("note-text").fill("Projector needed");
    await page.getByTestId("note-save").click();
    await expect(
      page.getByTestId("note-row").filter({ hasText: "Projector needed" }),
    ).toBeVisible();
    await page.getByTestId("tab-history").click();
    await expect(
      page.getByTestId("history-row").filter({ hasText: "Group created" }),
    ).toBeVisible();

    // Finish the group from the header menu; it leaves the active list.
    await page.getByTestId("group-more").click();
    await page.getByRole("menuitem", { name: "Finish group" }).click();
    await page.getByRole("button", { name: "Finish group" }).click();
    await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
    await page.goto("/en/groups");
    await expect(page.getByTestId("group-row").filter({ hasText: name })).toHaveCount(0);
    await page.goto("/en/groups?status=ARCHIVED");
    await expect(page.getByTestId("group-row").filter({ hasText: name })).toBeVisible();
  });

  test("Uzbek pages spell dates themselves and hydrate without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, CEO_PHONE);
    await page.goto("/uz/groups");
    await expect(page.getByRole("heading", { name: "Guruhlar" })).toBeVisible();
    await expect(page.getByTestId("group-row").filter({ hasText: "GE-Morning A1" })).toContainText(
      "1-sen, 2026",
    );
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await expect(page.getByTestId("group-schedule")).toContainText("seshanba");
    await expect(page.getByTestId("month-2026-09")).toHaveText("Sen 2026");
    await page.waitForLoadState("networkidle");
    // React 19 reports hydration mismatches as minified errors #418, #423 and #425 in production.
    expect(errors.filter((e) => /hydrat|#418|#423|#425/i.test(e))).toEqual([]);
  });

  test("teacher sees only their own groups and cannot create one", async ({ page, request }) => {
    await signIn(page, TEACHER_PHONE);
    await page.goto("/en/groups");
    await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
    const names = await page.getByTestId("group-row").locator("td:nth-child(1)").allInnerTexts();
    expect(names.join(" ")).toContain("GE-Morning A1");
    expect(names.join(" ")).toContain("IELTS Evening");
    expect(names.join(" ")).not.toContain("GE-Riverside B1");
    await expect(page.getByTestId("add-button")).toHaveCount(0);

    // The teacher may open their group and mark attendance, but not edit it.
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    await expect(page.getByTestId("attendance-grid")).toBeVisible();
    await expect(page.getByTestId("group-edit")).toHaveCount(0);
    await expect(page.getByTestId("add-member")).toHaveCount(0);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csrf = cookies.find((c) => c.name === "kampus_csrf")?.value ?? "";
    const response = await request.post("/api/v1/groups", {
      headers: { cookie: cookieHeader, "x-csrf-token": csrf, "content-type": "application/json" },
      data: { branchId: "x", name: "Hack", courseId: "x", slots: [], startDate: "2026-09-01" },
    });
    expect(response.status()).toBe(403);
    const mine = await request.get("/api/v1/groups?status=ALL", {
      headers: { cookie: cookieHeader },
    });
    expect(mine.status()).toBe(200);
    const body = (await mine.json()) as { items: Array<{ name: string }> };
    expect(body.items.map((g) => g.name).sort()).toEqual(["GE-Morning A1", "IELTS Evening"]);
  });
});
