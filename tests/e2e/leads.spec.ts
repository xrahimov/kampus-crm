import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();
const LEAD_NAME = `E2E Lead ${STAMP}`;
const FORM_SLUG = `e2e-form-${STAMP}`;

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

const column = (page: Page, name: RegExp) =>
  page.getByTestId("lead-column").filter({ has: page.getByRole("heading", { name }) });

test.describe("leads", () => {
  test("CEO creates a lead, moves it, adds it to a group and checks the sources report", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Leads" })
      .click();
    await expect(page).toHaveURL(/\/en\/leads/);
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
    await expect(page.getByTestId("board-select")).toContainText("Website");
    const newLeads = column(page, /NEW LEADS/);
    await expect(newLeads).toBeVisible();
    await expect(newLeads.getByTestId("lead-card").first()).toBeVisible();

    // "YANGI LID QO'SHISH" at the bottom of the column.
    await newLeads.getByTestId("add-lead").click();
    const dialog = page.getByTestId("lead-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill(LEAD_NAME);
    await dialog
      .getByLabel("Phone number", { exact: true })
      .fill(`+99894${String(STAMP).slice(-7)}`);
    await dialog.getByLabel("Source").click();
    await page.getByRole("option", { name: "Instagram" }).click();
    await dialog.getByLabel("Temperature").click();
    await page.getByRole("option", { name: "Hot" }).click();
    await dialog.getByLabel("Days").click();
    await page.getByRole("option", { name: /Even days/ }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const card = newLeads.getByTestId("lead-card").filter({ hasText: LEAD_NAME });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Hot");
    await expect(card).toContainText("Instagram");

    // Move it to "Contacted" through the card menu.
    await card.getByRole("button", { name: `Actions for ${LEAD_NAME}` }).click();
    await page.getByRole("menuitem", { name: "Contacted" }).click();
    const moved = column(page, /Contacted/)
      .getByTestId("lead-card")
      .filter({ hasText: LEAD_NAME });
    await expect(moved).toBeVisible();

    // Select it and add it to a group: it becomes a student and leaves the board.
    await moved.getByRole("checkbox", { name: `Select ${LEAD_NAME}` }).click();
    await page.getByTestId("leads-to-group").click();
    const toGroup = page.getByTestId("leads-to-group-dialog");
    await expect(toGroup).toBeVisible();
    await toGroup.getByLabel("Group", { exact: true }).click();
    await page.getByRole("option", { name: /GE-Morning A1/ }).click();
    await toGroup.getByRole("button", { name: "Save" }).click();
    await expect(toGroup).toBeHidden();
    await expect(page.getByRole("status")).toContainText("1 added");
    await expect(moved).toHaveCount(0);

    // Archive view shows the converted lead with a link to the student.
    await page.getByTestId("leads-archived").click();
    await expect(page).toHaveURL(/archived=true/);
    const archived = page.getByTestId("lead-card").filter({ hasText: LEAD_NAME });
    await expect(archived).toBeVisible();
    await expect(archived.getByRole("link", { name: "Student profile" })).toBeVisible();

    // Sources report counts the new lead for Instagram.
    await page.getByRole("link", { name: "Sources" }).click();
    await expect(page).toHaveURL(/\/en\/leads\/sources/);
    await expect(page.getByRole("heading", { name: "Sources report" })).toBeVisible();
    const instagram = page.getByTestId("source-card").filter({ hasText: "Instagram" });
    await expect(instagram).toBeVisible();
    expect(Number(await instagram.getByTestId("source-count").textContent())).toBeGreaterThan(0);
    await page.getByTestId("add-button").click();
    const source = page.getByTestId("source-dialog");
    await source.getByLabel("Source name").fill(`E2E Source ${STAMP}`);
    await source.getByRole("button", { name: "Save" }).click();
    await expect(source).toBeHidden();
    await expect(
      page.getByTestId("source-card").filter({ hasText: `E2E Source ${STAMP}` }),
    ).toBeVisible();
  });

  test("a public form creates a lead on the board", async ({ page, browser }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/settings/forms");
    await expect(page.getByRole("heading", { name: "Forms" })).toBeVisible();
    await expect(page.getByTestId("form-row").filter({ hasText: "Website form" })).toBeVisible();
    await page.getByTestId("add-button").click();
    const dialog = page.getByTestId("lead-form-dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(`E2E Form ${STAMP}`);
    await expect(dialog.getByLabel("Link name")).toHaveValue(FORM_SLUG);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByTestId("form-row").filter({ hasText: `E2E Form ${STAMP}` });
    await expect(row).toBeVisible();
    await expect(row).toContainText(`/en/forms/${FORM_SLUG}`);

    // A visitor without a session opens the link and sends their details.
    const visitor = await browser.newContext();
    const publicPage = await visitor.newPage();
    await publicPage.goto(`/en/forms/${FORM_SLUG}`);
    await expect(publicPage.getByRole("heading", { name: `E2E Form ${STAMP}` })).toBeVisible();
    await publicPage.getByLabel("Your name").fill(`E2E Visitor ${STAMP}`);
    await publicPage.getByLabel("Phone number").fill(`+99895${String(STAMP).slice(-7)}`);
    await publicPage.getByLabel("Comment").fill("Saw the ad");
    await publicPage.getByRole("button", { name: "Send" }).click();
    await expect(publicPage.getByTestId("public-form-done")).toContainText("Thank you");
    await visitor.close();

    await page.reload();
    await expect(row).toContainText("1");
    await page.goto("/en/leads");
    const card = page.getByTestId("lead-card").filter({ hasText: `E2E Visitor ${STAMP}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`E2E Form ${STAMP}`);
    await expect(card).toContainText("Saw the ad");
  });

  test("a group member can be returned to leads", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).click();
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const row = page.getByTestId("member-row").filter({ hasText: LEAD_NAME });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Actions for ${LEAD_NAME}` }).click();
    await page.getByTestId("to-lead").click();
    await page.getByTestId("to-lead-reason").fill("Postponed until spring");
    await page.getByRole("button", { name: "Return to leads" }).click();
    await expect(row).toHaveCount(0);

    await page.goto("/en/leads");
    const card = column(page, /NEW LEADS/)
      .getByTestId("lead-card")
      .filter({ hasText: LEAD_NAME });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Postponed until spring");
    await expect(card.getByRole("link", { name: "Student profile" })).toBeVisible();
  });
});
