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

test.describe("parents' page", () => {
  test("two siblings get one family link that lists both children and opens each child's page", async ({
    page,
    browser,
  }) => {
    await signIn(page, CEO_PHONE);
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const stamp = String(Date.now());

    // Two new students in the seeded morning group.
    const groups = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ id: string; name: string; branchId: string }> };
    const group = groups.items.find((g) => g.name === "GE-Morning A1")!;
    const ids: string[] = [];
    for (const [i, name] of ["Aziz", "Bobur"].entries()) {
      const created = await page.request.post("/api/v1/students", {
        headers,
        data: {
          branchId: group.branchId,
          fullName: `E2E ${name} ${stamp}`,
          phone: `+99893${stamp.slice(-7 + i)}${i}`.slice(0, 13),
          gender: "MALE",
          membership: {
            groupId: group.id,
            joinedAt: "2026-10-01",
            customPrice: null,
            note: null,
            status: "ACTIVE",
          },
        },
      });
      expect(created.status()).toBe(201);
      ids.push(((await created.json()) as { id: string }).id);
    }
    const linked = await page.request.post(`/api/v1/students/${ids[0]}/family/link`, {
      headers,
      data: { studentId: ids[1], name: `E2E Family ${stamp}` },
    });
    expect(linked.status()).toBe(201);

    // The family card offers the parents' page link.
    await page.goto(`/en/students/${ids[0]}`);
    await expect(page.getByTestId("family-name")).toHaveText(`E2E Family ${stamp}`);
    await page.getByTestId("family-portal").click();
    const dialog = page.getByTestId("family-portal-dialog");
    await expect(dialog).toBeVisible();
    const input = dialog.getByTestId("family-portal-url");
    await expect(input).toHaveValue(/\/family\/[A-Za-z0-9_-]{20,}$/);
    const url = await input.inputValue();
    const path = new URL(url).pathname;

    // Parents open it without signing in.
    const parents = await (await browser.newContext()).newPage();
    await parents.goto(path);
    await expect(parents.getByTestId("family-portal-title")).toContainText(`E2E Family ${stamp}`);
    const children = parents.getByTestId("family-child");
    await expect(children).toHaveCount(2);
    await expect(children.first()).toContainText("GE-Morning A1");
    await expect(parents.getByTestId("family-open-page")).toHaveCount(2);
    await parents.getByTestId("family-open-page").first().click();
    await expect(parents).toHaveURL(/\/class\//);
    await expect(parents.getByTestId("class-title")).toContainText("Hello, E2E");
    await expect(parents.getByRole("navigation", { name: "Main" })).toHaveCount(0);

    // A new link retires the old one.
    await dialog.getByTestId("family-portal-reset").click();
    await expect(input).not.toHaveValue(url);
    await parents.goto(path);
    await expect(parents.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await parents.context().close();

    // Clean up.
    for (const id of ids) {
      expect((await page.request.delete(`/api/v1/students/${id}`, { headers })).ok()).toBeTruthy();
    }
  });
});
