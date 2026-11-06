import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

test.describe("student app install", () => {
  test("the student pages carry their own manifest, icons and service worker", async ({
    browser,
    request,
  }) => {
    const manifest = await request.get("/student.webmanifest");
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
    const body = (await manifest.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(body.name).toBe("My Kampus");
    expect(body.start_url).toBe("/student");
    expect(body.display).toBe("standalone");
    expect(body.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    for (const icon of body.icons) {
      const png = await request.get(icon.src);
      expect(png.status()).toBe(200);
      expect(png.headers()["content-type"]).toContain("image/png");
    }
    const sw = await request.get("/student-sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["content-type"]).toContain("javascript");

    // A student's link points at the student manifest; the staff app keeps its own.
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await expect(teacher.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string }>;
    await teacherContext.close();

    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/student.webmanifest",
    );
    await expect(student.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/icons/student-apple-touch-icon.png",
    );
    await expect(student.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "My Kampus",
    );
    // The service worker takes the page over.
    const controlled = await student.evaluate(
      () => navigator.serviceWorker.ready.then((r) => r.active?.scriptURL ?? "") as Promise<string>,
    );
    expect(controlled).toContain("/student-sw.js");
    // Nothing of this on a staff page: the sign-in page is not a student page.
    await expect(student.getByTestId("student-offline")).toHaveCount(0);
  });
});
