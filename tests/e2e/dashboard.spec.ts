import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("dashboard, search and notifications", () => {
  test("the setup checklist shows what the centre still lacks and can be hidden", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const shown = await page.request.patch("/api/v1/dashboard/setup", {
      headers,
      data: { shown: true },
    });
    expect(shown.ok()).toBeTruthy();
    const list = (await shown.json()) as {
      done: number;
      total: number;
      steps: Array<{ key: string; done: boolean }>;
    };
    expect(list.total).toBe(9);
    await page.goto("/en/dashboard");
    const card = page.getByTestId("setup-checklist");
    if (list.done === list.total) {
      // Everything is set up: the card stays away on its own.
      await expect(card).toHaveCount(0);
      return;
    }
    await expect(card).toBeVisible();
    await expect(card).toContainText(`${list.done} of ${list.total} done`);
    const groups = list.steps.find((s) => s.key === "groups")!;
    await expect(card.getByTestId("setup-step-groups")).toContainText("Groups");
    await expect(card.getByTestId("setup-step-groups")).toHaveAttribute(
      "data-done",
      String(groups.done),
    );
    const open = list.steps.find((s) => !s.done)!;
    await expect(card.getByTestId(`setup-step-${open.key}`).getByRole("link")).toBeVisible();
    await card.getByTestId("setup-hide").click();
    await expect(card).toHaveCount(0);
    // The switch in Settings → General brings it back.
    await page.goto("/en/settings/general");
    const toggle = page.getByTestId("switch-showSetupChecklist");
    await expect(toggle).toHaveAttribute("data-state", "unchecked");
    await toggle.click();
    await page.getByTestId("org-save").click();
    await expect(toggle).toHaveAttribute("data-state", "checked");
    await page.goto("/en/dashboard");
    await expect(page.getByTestId("setup-checklist")).toBeVisible();
  });

  test("KPIs stay masked until shown, cards link to lists, schedule and finance render", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome, Demo CEO");
    const values = page.getByTestId("dash-value");
    await expect(values).toHaveCount(12);
    await expect(values.first()).toHaveText("***");
    await page.getByTestId("show-numbers").click();
    await expect(values.first()).not.toHaveText("***");
    await expect(page.getByTestId("dash-groups")).toContainText("Groups");
    await expect(page.getByTestId("dash-newAdmissions")).toContainText("NEW");
    await expect(page.getByTestId("utilisation-badge")).toContainText("%");

    // The schedule: weekday tabs, time step and a block for the seeded morning group.
    const schedule = page.getByTestId("schedule");
    await expect(schedule).toBeVisible();
    // Today's tab is already selected and clicking it changes nothing, so on
    // Tuesdays go through another day first (Monday, or Wednesday on Mondays).
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "Asia/Tashkent",
    });
    const detour = today === "Mon" ? 3 : 1;
    await page.getByTestId(`schedule-day-${detour}`).click();
    await expect(page).toHaveURL(new RegExp(`weekday=${detour}`));
    await page.getByTestId("schedule-day-2").click();
    await expect(page).toHaveURL(/weekday=2/);
    await expect(schedule.getByTestId("schedule-room").first()).toBeVisible();
    await expect(schedule.getByTestId("schedule-block").first()).toContainText("GE-Morning A1");
    await page.getByTestId("schedule-step").click();
    await page.getByRole("option", { name: "60 minutes" }).click();
    await expect(page).toHaveURL(/step=60/);

    // The revenue forecast (A-133): this month against collected, next month, the split by course.
    const forecast = page.getByTestId("dashboard-forecast");
    await expect(forecast).toBeVisible();
    await expect(forecast.getByTestId("forecast-expected")).not.toHaveText("***");
    await expect(forecast.getByTestId("forecast-percent")).toContainText("% collected");
    await expect(forecast.getByTestId("forecast-next-month")).toBeVisible();
    await expect(forecast.getByTestId("forecast-course").first()).toBeVisible();

    // The finance section follows the year and month filters.
    const finance = page.getByTestId("dashboard-finance");
    await expect(finance.getByTestId("finance-income")).toBeVisible();
    await expect(finance.getByTestId("donut")).toBeVisible();
    await page.getByTestId("finance-month").click();
    await page.getByRole("option", { name: "Whole year" }).click();
    await expect(page).not.toHaveURL(/month=/);

    // Cards are links to the filtered lists.
    await page.getByTestId("dash-debtors").click();
    await expect(page).toHaveURL(/\/en\/debts/);
    await expect(page.getByRole("heading", { name: "Debtors", exact: true })).toBeVisible();
  });

  test("global search finds a student, a group and a lead and navigates", async ({ page }) => {
    await signIn(page, CEO_PHONE);
    const box = page.getByTestId("global-search");
    await box.fill("Demo Student O");
    const results = page.getByTestId("global-search-results");
    await expect(
      results.getByTestId("search-hit").filter({ hasText: "Demo Student One" }),
    ).toBeVisible();
    await box.fill("GE-Morning");
    await expect(results).toContainText("Groups");
    await results.getByTestId("search-hit").filter({ hasText: "GE-Morning A1" }).click();
    await expect(page).toHaveURL(/\/groups\//);
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    await page.getByTestId("global-search").fill("zzz-nobody-here");
    await expect(page.getByTestId("global-search-results")).toContainText("Nothing found.");
  });

  test("the bell lists notifications, marks them read and opens the full page", async ({
    page,
  }) => {
    // A website visitor sends the public form: every lead viewer is told (A-97).
    const sent = await page.request.post("/api/v1/public/lead-forms/website", {
      data: { fullName: `E2E Bell ${STAMP}`, phone: `+99894${String(STAMP).slice(-7)}` },
      headers: { origin: process.env.APP_URL ?? "http://localhost:3000" },
    });
    expect(sent.status()).toBe(201);
    await signIn(page, CEO_PHONE);
    const count = page.getByTestId("notification-count");
    await expect(count).toBeVisible();
    await page.getByTestId("notification-bell").click();
    const panel = page.getByTestId("notification-panel");
    await expect(panel.getByTestId("notification-item").first()).toBeVisible();
    await panel.getByTestId("all-notifications").click();
    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    // The seeded payment notice is rendered from its stored kind and parameters.
    await expect(
      page.getByTestId("notification-row").filter({ hasText: `New lead E2E Bell ${STAMP}` }),
    ).toBeVisible();
    await page.getByTestId("unread-only").click();
    await expect(page).toHaveURL(/unread=1/);
    await page.getByTestId("mark-all-read-page").click();
    await expect(page.getByTestId("notification-row")).toHaveCount(0);
    await page.getByTestId("unread-only").click();
    await expect(page.getByTestId("notification-row").first()).toBeVisible();
    await expect(page.getByTestId("notification-count")).toHaveCount(0);
  });
});
