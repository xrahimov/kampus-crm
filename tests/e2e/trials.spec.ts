import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = Date.now();

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

/** The calendar day in Tashkent (UTC+5), which Today and trial dates use. */
const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

test.describe("trial lessons", () => {
  test("the office books a trial from the lead card, the teacher marks the visit on Today and the report counts it", async ({
    browser,
  }) => {
    const date = todayTashkent();
    const name = `E2E Trial ${STAMP}`;

    const office = await (await browser.newContext()).newPage();
    await signIn(office, CEO_PHONE);
    const cookies = await office.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    // The teacher's group has an early extra lesson today, whatever the weekday.
    const groups = await office.request.get("/api/v1/groups?q=GE-Morning", { headers });
    const groupId = (
      (await groups.json()) as { items: Array<{ id: string; name: string }> }
    ).items.find((g) => g.name === "GE-Morning A1")!.id;
    const extra = await office.request.post(`/api/v1/groups/${groupId}/lessons/extra`, {
      headers,
      data: { date, startTime: "07:00", endTime: "07:45" },
    });
    expect([200, 201, 400, 409]).toContain(extra.status());
    const board = (await (await office.request.get("/api/v1/leads", { headers })).json()) as {
      columns: Array<{ id: string }>;
    };
    const created = await office.request.post("/api/v1/leads", {
      headers,
      data: {
        columnId: board.columns[0]!.id,
        fullName: name,
        phones: [`+99896${String(STAMP).slice(-7)}`],
      },
    });
    expect(created.status()).toBe(201);
    const lead = (await created.json()) as { id: string; boardId: string };

    // "Book a trial" on the card: the group, today, a note.
    await office.goto(`/en/leads?board=${lead.boardId}&q=${encodeURIComponent(name)}`);
    const card = office.getByTestId("lead-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Actions for ${name}` }).click();
    await office.getByTestId("lead-book-trial").click();
    const dialog = office.getByTestId("trial-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Group", { exact: true }).click();
    await office.getByRole("option", { name: /GE-Morning A1/ }).click();
    // The dialog defaults to the browser's own date, which differs from Tashkent's
    // for a few hours a day; the test sets the date it wants.
    await dialog.getByTestId("trial-date").fill(date);
    await dialog.getByLabel("Note for the teacher").fill("Knows some English");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(office.getByRole("status")).toContainText("Trial booked");
    await expect(card.getByTestId("lead-trial")).toHaveAttribute("data-trial-status", "BOOKED");
    await expect(card.getByTestId("lead-trial")).toContainText("Trial");

    // The teacher sees the visitor under the lesson and marks the visit.
    const teacher = await (await browser.newContext()).newPage();
    await signIn(teacher, TEACHER_PHONE);
    await expect(teacher).toHaveURL(/\/en\/today/);
    const lessonCard = teacher.getByTestId("today-lesson").filter({ hasText: "GE-Morning A1" });
    const visitor = lessonCard.getByTestId("today-trial").filter({ hasText: name });
    await expect(visitor.first()).toBeVisible();
    await expect(visitor.first()).toContainText("Knows some English");
    await expect(visitor.first()).toHaveAttribute("data-status", "BOOKED");
    await visitor.first().getByTestId("today-trial-came").click();
    await expect(visitor.first()).toHaveAttribute("data-status", "ATTENDED");
    await teacher.context().close();

    // The card shows the outcome; the report counts the trial.
    await office.reload();
    await expect(card.getByTestId("lead-trial")).toHaveAttribute("data-trial-status", "ATTENDED");
    await expect(card.getByTestId("lead-trial")).toContainText("Came to trial");
    await office.goto(
      `/en/reports/leads?year=${date.slice(0, 4)}&month=${Number(date.slice(5, 7))}`,
    );
    await expect(office.getByRole("heading", { name: "Lead statements" })).toBeVisible();
    const trials = office.getByTestId("report-trials");
    await expect(trials).toBeVisible();
    await expect(trials.getByTestId("report-trials-row").first()).toBeVisible();
    await office.context().close();
  });
});
