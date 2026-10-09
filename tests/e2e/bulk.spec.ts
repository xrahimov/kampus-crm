import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = String(Date.now());

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

async function apiHeaders(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

test.describe("bulk actions", () => {
  test("the office ticks students, adds them to a group, sends an SMS, archives and restores them", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const groups = await page.request.get("/api/v1/groups?q=GE-Morning", { headers });
    const group = (
      (await groups.json()) as { items: Array<{ id: string; name: string; branchId: string }> }
    ).items.find((g) => g.name === "GE-Morning A1")!;
    const tag = `E2E Bulk ${STAMP}`;
    for (const [i, name] of ["Ann", "Ben"].entries()) {
      const created = await page.request.post("/api/v1/students", {
        headers,
        data: {
          branchId: group.branchId,
          fullName: `${tag} ${name}`,
          phone: `+99892${STAMP.slice(-6)}${i}`,
          gender: "FEMALE",
          membership: null,
        },
      });
      expect(created.status()).toBe(201);
    }

    await page.goto(`/en/students?q=${encodeURIComponent(tag)}`);
    const rows = page.getByTestId("student-row");
    await expect(rows).toHaveCount(2);
    await page.getByTestId("students-select-all").click();
    const bar = page.getByTestId("students-bulk");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("students-bulk-count")).toHaveText("2 selected");
    await expect(page.getByTestId("bulk-excel")).toHaveAttribute("href", /ids=/);

    // Add both to a group in one go.
    await page.getByTestId("bulk-add-to-group").click();
    const dialog = page.getByTestId("students-bulk-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Group", { exact: true }).click();
    await page.getByRole("option", { name: /GE-Morning A1/ }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toContainText("2 done, 0 skipped");
    await expect(rows.first()).toContainText("GE-Morning A1");
    await expect(rows.nth(1)).toContainText("GE-Morning A1");

    // The SMS dialog counts the two recipients.
    await page.getByTestId("students-select-all").click();
    await page.getByTestId("bulk-sms").click();
    const sms = page.getByTestId("send-sms-dialog");
    await expect(sms).toBeVisible();
    await expect(sms).toContainText("2 recipients");
    await sms.getByRole("button", { name: "Cancel" }).click();
    await expect(sms).toBeHidden();

    // Archive both, then bring them back from the archive view.
    await page.getByTestId("bulk-archive").click();
    await page.getByRole("button", { name: "Archive", exact: true }).last().click();
    await expect(page.getByRole("status")).toContainText("2 done, 0 skipped");
    await expect(rows).toHaveCount(0);
    await page.getByTestId("students-archived").click();
    await expect(page).toHaveURL(/archived=true/);
    await expect(rows).toHaveCount(2);
    await page.getByTestId("students-select-all").click();
    await page.getByTestId("bulk-archive").click();
    await page.getByRole("button", { name: "Restore", exact: true }).last().click();
    await expect(page.getByRole("status")).toContainText("2 done, 0 skipped");
    await expect(rows).toHaveCount(0);
  });

  test("the office ticks leads, moves them to a column and archives them", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const board = (await (await page.request.get("/api/v1/leads", { headers })).json()) as {
      board: { id: string };
      columns: Array<{ id: string; name: string }>;
    };
    const tag = `E2E BulkLead ${STAMP}`;
    for (const [i, name] of ["One", "Two"].entries()) {
      const created = await page.request.post("/api/v1/leads", {
        headers,
        data: {
          columnId: board.columns[0]!.id,
          fullName: `${tag} ${name}`,
          phones: [`+99891${STAMP.slice(-6)}${i}`],
        },
      });
      expect(created.status()).toBe(201);
    }
    await page.goto(`/en/leads?board=${board.board.id}&q=${encodeURIComponent(tag)}`);
    const cards = page.getByTestId("lead-card").filter({ hasText: tag });
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) await card.getByRole("checkbox").click();
    await expect(page.getByTestId("leads-bulk-count")).toHaveText("2 selected");
    await page.getByTestId("bulk-move").click();
    await page.getByRole("menuitem", { name: "Contacted" }).click();
    await expect(page.getByRole("status")).toContainText("2 done, 0 skipped");
    const contacted = page
      .getByTestId("lead-column")
      .filter({ has: page.getByRole("heading", { name: /Contacted/ }) });
    await expect(contacted.getByTestId("lead-card").filter({ hasText: tag })).toHaveCount(2);

    for (const card of await cards.all()) await card.getByRole("checkbox").click();
    await page.getByTestId("bulk-archive").click();
    await page.getByRole("button", { name: "Archive", exact: true }).last().click();
    await expect(page.getByRole("status")).toContainText("2 done, 0 skipped");
    await expect(cards).toHaveCount(0);
  });
});
