import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

test.describe("announcements", () => {
  test("a notice to a group reaches the student's page and its read is counted", async ({
    page,
    browser,
  }) => {
    await signIn(page, CEO_PHONE);
    const stamp = String(Date.now());
    const title = `E2E Notice ${stamp}`;

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Announcements" })
      .click();
    await expect(page).toHaveURL(/\/en\/announcements/);
    await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible();

    await page.getByTestId("announcements-new").click();
    const dialog = page.getByTestId("announcement-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("announcement-group").click();
    await page.getByRole("option", { name: "GE-Morning A1" }).click();
    await dialog.getByTestId("announcement-title-input").fill(title);
    await dialog.getByTestId("announcement-body").fill("No lesson on Friday: public holiday.");
    await dialog.getByRole("button", { name: "Post" }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByTestId("announcement-row").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("announcement-target")).toHaveText("GE-Morning A1");
    await expect(row.getByTestId("announcement-reads")).toContainText("0 of ");

    // A student of the group opens their page: the notice is under News and counts as read.
    const groups = (await (await page.request.get("/api/v1/groups?q=GE-Morning")).json()) as {
      items: Array<{ id: string; name: string }>;
    };
    const group = groups.items.find((g) => g.name === "GE-Morning A1")!;
    const links = (await (
      await page.request.get(`/api/v1/groups/${group.id}/video/links`)
    ).json()) as Array<{ token: string }>;
    const student = await browser.newContext();
    const studentPage = await student.newPage();
    await studentPage.goto(`/en/class/${links[0]!.token}`);
    const tab = studentPage.getByTestId("portal-tab-announcements");
    await expect(tab).toBeVisible();
    await tab.click();
    const notice = studentPage.getByTestId("portal-announcement").filter({ hasText: title });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("GE-Morning A1");
    await expect
      .poll(async () => {
        const list = (await (
          await page.request.get("/api/v1/announcements?audience=GROUP")
        ).json()) as { items: Array<{ title: string; reads: number }> };
        return list.items.find((a) => a.title === title)?.reads;
      })
      .toBe(1);
    await student.close();

    await page.reload();
    await expect(row.getByTestId("announcement-reads")).toContainText("1 of ");

    // Clean up.
    await row.getByTestId("announcement-delete").click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("announcement-row").filter({ hasText: title })).toHaveCount(0);
  });
});
