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

test.describe("tests on the student's page", () => {
  test("a student opens an active test from their link, answers against the clock and sees the score", async ({
    browser,
  }) => {
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

    // The office writes a question and gives the group an active, timed test.
    const question = await office.request.post("/api/v1/question-bank", {
      headers,
      data: {
        subject: `E2E Portal ${STAMP}`,
        topic: "Articles",
        text: `Choose the article (${STAMP}).`,
        options: ["a", "an", "the", "no article"],
        correctIndex: 2,
      },
    });
    expect(question.status()).toBe(201);
    const questionId = ((await question.json()) as { id: string }).id;
    const testName = `E2E Portal test ${STAMP}`;
    const created = await office.request.post("/api/v1/tests", {
      headers,
      data: {
        name: testName,
        subject: `E2E Portal ${STAMP}`,
        timeLimitMinutes: 10,
        passPercent: 50,
        deadline: null,
        status: "ACTIVE",
        groupIds: [groupId],
        questions: [{ questionId, points: 3 }],
      },
    });
    expect(created.status()).toBe(201);
    const testId = ((await created.json()) as { id: string }).id;
    const links = await office.request.get(`/api/v1/groups/${groupId}/video/links`, { headers });
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    expect(first).toBeTruthy();

    // The student opens their link: the Tests tab counts the open test.
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("class-title")).toHaveText(`Hello, ${first!.fullName}`);
    await student.getByTestId("portal-tab-tests").click();
    const item = student.getByTestId("portal-test").filter({ hasText: testName });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("data-state", "open");
    await expect(item).toContainText("1 question");
    await expect(item).toContainText("10 min");
    await expect(item).toContainText("Pass mark 50%");
    await item.getByTestId("portal-test-start").click();

    // The runner: the clock, the question, one option, hand in.
    const run = student.getByTestId("portal-test-run");
    await expect(run).toBeVisible();
    await expect(run.getByTestId("portal-test-clock")).toContainText(/Time left: 9:5\d/);
    await expect(run.getByTestId("portal-test-question")).toHaveCount(1);
    await run.getByRole("radio", { name: "the" }).click();
    await expect(run).toContainText("1 of 1 answered");
    student.once("dialog", (d) => void d.accept());
    await run.getByTestId("portal-test-submit").click();

    // The result at once, and the list shows the test as taken.
    const result = student.getByTestId("portal-test-result");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("data-passed", "true");
    await expect(result).toContainText("3 of 3 points");
    await expect(result).toContainText("100%");
    await expect(item).toHaveAttribute("data-state", "taken");
    await expect(item.getByTestId("portal-test-score")).toContainText("3 / 3 points · 100%");
    await expect(item.getByTestId("portal-test-start")).toHaveCount(0);

    // A second hand-in is refused by the server.
    const again = await student.request.post(
      `/api/v1/public/class/${first!.token}/tests/${testId}`,
      { headers: { "content-type": "application/json" }, data: { answers: {} } },
    );
    expect(again.status()).toBe(409);

    // The teacher's side lists the attempt like any other result.
    await office.goto(`/en/settings/tests/${testId}`);
    await expect(office.getByTestId("test-title")).toHaveText(testName);
    await expect(office.getByTestId("attempt-row").first()).toContainText("3 / 3 · 100%");
    await expect(office.getByTestId("attempt-row").first()).toContainText(first!.fullName);
    await student.context().close();
    await office.context().close();
  });
});
