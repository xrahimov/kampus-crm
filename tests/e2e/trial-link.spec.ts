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

/** A day next week, so the visitor's page shows the "come back on the day" notice. */
const nextWeek = () => new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);

test.describe("trial visitor's link", () => {
  test("the office copies the visitor's link from the lead card and the visitor's page shows the visit", async ({
    browser,
  }) => {
    const name = `E2E Trial link ${STAMP}`;
    const office = await (await browser.newContext()).newPage();
    await signIn(office, CEO_PHONE);
    const cookies = await office.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const groups = await office.request.get("/api/v1/groups?q=GE-Morning", { headers });
    const groupId = (
      (await groups.json()) as { items: Array<{ id: string; name: string }> }
    ).items.find((g) => g.name === "GE-Morning A1")!.id;
    const board = (await (await office.request.get("/api/v1/leads", { headers })).json()) as {
      columns: Array<{ id: string }>;
    };
    const created = await office.request.post("/api/v1/leads", {
      headers,
      data: {
        columnId: board.columns[0]!.id,
        fullName: name,
        phones: [`+99897${String(STAMP).slice(-7)}`],
      },
    });
    expect(created.status()).toBe(201);
    const lead = (await created.json()) as { id: string; boardId: string };
    const booked = await office.request.post(`/api/v1/leads/${lead.id}/trials`, {
      headers,
      data: { groupId, date: nextWeek(), note: null },
    });
    expect(booked.status()).toBe(201);
    const booking = (await booked.json()) as { token: string | null };
    expect(booking.token).toBeTruthy();

    // The card offers the link.
    await office.goto(`/en/leads?board=${lead.boardId}&q=${encodeURIComponent(name)}`);
    const card = office.getByTestId("lead-card").filter({ hasText: name });
    await expect(card.getByTestId("lead-trial")).toHaveAttribute("data-trial-status", "BOOKED");
    await expect(card.getByTestId("lead-trial-link")).toBeVisible();
    await office.context().close();

    // The visitor's page: the visit, and the notice that the link opens on the day.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/en/class/trial/${booking.token}`);
    await expect(visitor.getByTestId("trial-title")).toHaveText(`Welcome, ${name}`);
    await expect(visitor.getByTestId("trial-page")).toContainText("GE-Morning A1");
    await expect(visitor.getByTestId("trial-not-today")).toBeVisible();
    await expect(visitor.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    // An unknown token is a dead end.
    const missing = await visitor.goto("/en/class/trial/nope-nope-nope-nope-nope");
    expect(missing?.status()).toBe(404);
  });
});
