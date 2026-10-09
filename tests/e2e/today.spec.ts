import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

/** The calendar day in Tashkent (UTC+5), which is what Today shows. */
const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

test.describe("today", () => {
  test("a teacher lands on Today, marks attendance with one tap and sets homework", async ({
    browser,
  }) => {
    const date = todayTashkent();

    // The office adds an early extra lesson for the teacher's group, so the day has one whatever the weekday.
    const office = await (await browser.newContext()).newPage();
    await signIn(office, CEO_PHONE);
    const cookies = await office.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csrf = cookies.find((c) => c.name === "kampus_csrf")?.value ?? "";
    const groups = await office.request.get("/api/v1/groups?q=GE-Morning", {
      headers: { cookie: cookieHeader },
    });
    const groupId = (
      (await groups.json()) as { items: Array<{ id: string; name: string }> }
    ).items.find((g) => g.name === "GE-Morning A1")!.id;
    const extra = await office.request.post(`/api/v1/groups/${groupId}/lessons/extra`, {
      headers: { cookie: cookieHeader, "x-csrf-token": csrf, "content-type": "application/json" },
      data: { date, startTime: "07:00", endTime: "07:45" },
    });
    // A second run on the same day finds the lesson already there (a duplicate is refused).
    expect([200, 201, 400, 409]).toContain(extra.status());
    await office.context().close();

    const page = await (await browser.newContext()).newPage();
    await signIn(page, TEACHER_PHONE);
    await expect(page).toHaveURL(/\/en\/today/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }),
    ).toBeVisible();

    const card = page.getByTestId("today-lesson").filter({ hasText: "07:00–07:45" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("GE-Morning A1");
    await expect(card).toContainText("Extra lesson");
    const members = card.getByTestId("today-member");
    await expect(members.first()).toBeVisible();
    const total = await members.count(); // the seed's four plus whoever other runs enrolled

    // Everyone present in one tap, then one student turns out to be absent.
    await card.getByTestId("today-all-present").click();
    await expect(card.getByTestId("today-attendance-summary")).toContainText(
      `${total} of ${total} marked`,
    );
    for (const chip of await members.all())
      await expect(chip).toHaveAttribute("data-status", "PRESENT");
    await expect(card.getByTestId("today-all-present")).toHaveCount(0);
    await members.first().click();
    await expect(members.first()).toHaveAttribute("data-status", "ABSENT");
    await expect(card.getByTestId("today-attendance-summary")).toContainText(
      `${total - 1} present`,
    );

    // Homework in two fields.
    const stamp = String(Date.now()).slice(-6);
    await card.getByTestId("today-homework-set").click();
    await card.getByTestId("today-homework-text").fill(`Exercise ${stamp}`);
    await card.getByTestId("today-homework-save").click();
    await expect(card.getByTestId("today-homework")).toContainText(`Exercise ${stamp}`);
    await expect(card.getByTestId("today-homework")).toContainText("no answers yet");

    // The marks and the homework are the group's: the attendance grid shows them.
    await page.goto(`/en/groups/${groupId}?month=${date.slice(0, 7)}`);
    const grid = page.getByTestId("attendance-grid");
    await expect(grid).toBeVisible();
    await expect(grid.getByRole("button", { name: /✕|Absent/ }).first()).toBeVisible();

    // Other days and the rest of the page.
    await page.goto("/en/today");
    await page.getByTestId("today-next").click();
    await expect(page).toHaveURL(/date=/);
    await expect(page.getByTestId("today-back")).toBeVisible();
    await page.getByTestId("today-back").click();
    await expect(page.getByTestId("today-next-lesson")).toBeVisible();
    await expect(page.getByTestId("today-debtors")).toBeVisible();
    await page.context().close();
  });

  test("the app is installable: manifest, icons and the home-screen tags are served", async ({
    page,
    request,
  }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
    const body = (await manifest.json()) as {
      name: string;
      display: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(body.name).toBe("Kampus");
    expect(body.display).toBe("standalone");
    expect(body.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    for (const icon of body.icons) {
      const png = await request.get(icon.src);
      expect(png.status()).toBe(200);
      expect(png.headers()["content-type"]).toContain("image/png");
    }
    await page.goto("/en/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#17234b");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });
});
