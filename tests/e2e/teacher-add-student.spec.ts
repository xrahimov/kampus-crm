import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

async function setTeacherCanAdd(page: Page, on: boolean) {
  const cookies = await page.context().cookies();
  const headers = {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
  const settings = (await (await page.request.get("/api/v1/settings/org", { headers })).json()) as {
    teacherCanAddStudents: boolean;
  };
  const saved = await page.request.put("/api/v1/settings/org", {
    headers,
    data: { ...settings, teacherCanAddStudents: on },
  });
  expect(saved.ok()).toBe(true);
}

test.describe("teachers add students (A-61)", () => {
  test("with the centre's switch on, a teacher adds a new student to their own group", async ({
    browser,
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    await setTeacherCanAdd(page, true);
    const stamp = String(Date.now()).slice(-7);
    const name = `E2E Teacher Added ${stamp}`;

    try {
      const teacher = await (await browser.newContext()).newPage();
      await signIn(teacher, TEACHER_PHONE);
      await teacher.goto("/en/groups");
      await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
      await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");

      // The teacher may add a new student, not pick an existing one.
      await teacher.getByTestId("add-member").click();
      const dialog = teacher.getByTestId("add-member-dialog");
      await expect(dialog).toContainText("Add a new student");
      await expect(dialog.locator("#member-new")).toHaveCount(0);
      await expect(dialog.locator("#member-search")).toHaveCount(0);
      await dialog.locator("#member-fullName").fill(name);
      await dialog.locator("#member-phone").fill(`+99894${stamp}`);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toBeHidden();
      await expect(teacher.getByTestId("members-card")).toContainText(name);

      // The Students page offers the drawer too, with the teacher's groups only.
      await teacher.goto("/en/students");
      await expect(teacher.getByTestId("add-button")).toBeVisible();
      await teacher.context().close();
    } finally {
      await setTeacherCanAdd(page, false);
    }

    // With the switch off the button is gone.
    const again = await (await browser.newContext()).newPage();
    await signIn(again, TEACHER_PHONE);
    await again.goto("/en/groups");
    await again.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(again.getByTestId("group-title")).toHaveText("GE-Morning A1");
    await expect(again.getByTestId("add-member")).toHaveCount(0);
  });
});
