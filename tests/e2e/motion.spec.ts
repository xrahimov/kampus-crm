import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(CEO_PHONE);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

/** Where the sidebar's marker sits, in pixels from the top of the list. */
async function markerOffset(page: Page): Promise<number> {
  const transform = await page
    .getByTestId("nav-marker")
    .evaluate((el) => (el as HTMLElement).style.transform);
  return Number(/translateY\((-?\d+(?:\.\d+)?)px\)/.exec(transform)?.[1] ?? Number.NaN);
}

// The look and the motion of the app (A-192).
test.describe("motion", () => {
  test("the sidebar marker follows the page, and a page change leaves nothing behind", async ({
    page,
  }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    expect(await markerOffset(page)).toBe(0);

    await nav.getByRole("link", { name: "Students" }).click();
    await expect(page).toHaveURL(/\/en\/students/);
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Students" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await markerOffset(page)).toBeGreaterThan(0);
    // The "page on its way" signal is taken down once the page is there.
    await expect(page.locator("html")).not.toHaveAttribute("data-navigating", /.*/);

    // A name pressed in the list is the heading of the page it opens.
    const first = page.locator("tbody tr").first().getByRole("link").first();
    const name = (await first.textContent())!.trim();
    await first.click();
    await expect(page).toHaveURL(/\/en\/students\/.+/);
    await expect(page.getByTestId("student-title")).toHaveText(name);
    await expect(page.locator("html")).not.toHaveAttribute("data-navigating", /.*/);

    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
  });

  test("the figures roll in as counters and still read as plain numbers", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/dashboard");
    const values = page.getByTestId("dash-value");
    await expect(values.first()).toHaveText("***");
    await page.getByTestId("show-numbers").click();
    // Every digit is a rolling column, but the text of the card is the figure alone.
    await expect(values.first().locator(".odo-digit").first()).toBeVisible();
    for (const text of await values.allTextContents()) {
      expect(text).toMatch(/^[^*]*\d[^*]*$/);
      expect(text.replace(/\D/g, "").length).toBeLessThan(16);
    }
    await page.getByTestId("show-numbers").click();
    await expect(values.first()).toHaveText("***");
  });

  test("with less motion asked for, pages change at once and nothing keeps moving", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en/login");
    await expect(page.getByTestId("tile-wall")).toBeVisible();
    // The wandering daylight is switched off; the wall itself stays.
    await expect(page.locator(".wall-daylight")).toBeHidden();

    await signIn(page);
    await page.goto("/en/dashboard");
    await page.getByTestId("show-numbers").click();
    const running = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) > 1)
          .length,
    );
    expect(running).toBe(0);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Groups" })
      .click();
    await expect(page).toHaveURL(/\/en\/groups/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Groups");
  });

  test("on a phone the header fits the screen and the drawer opens the next page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/en/dashboard");
    await expect(page.getByTestId("user-menu")).toBeInViewport();
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Students" }).click();
    await expect(page).toHaveURL(/\/en\/students/);
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
  });
});
