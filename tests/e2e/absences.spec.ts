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

/** The calendar day in Tashkent (UTC+5), which is what the lessons are dated in. */
const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type Lesson = { id: string; date: string; startTime: string };
type Grid = { lessons: Lesson[]; members: Array<{ membershipId: string; studentId: string }> };

test.describe("absence follow-up", () => {
  test("a student who misses two lessons in a row is listed, gets a call logged and leaves the list once back", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const cookies = await page.context().cookies();
    const headers = {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
      "content-type": "application/json",
    };
    const today = todayTashkent();
    const stamp = String(Date.now());
    const name = `E2E Absent ${stamp}`;

    // GE-Morning A1 and its two most recent lessons before today.
    const groups = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ id: string; name: string; branchId: string }> };
    const group = groups.items.find((g) => g.name === "GE-Morning A1")!;
    const lessons: Lesson[] = [];
    for (const month of [today.slice(0, 7), shift(today, -31).slice(0, 7)]) {
      const grid = (await (
        await page.request.get(`/api/v1/groups/${group.id}/lessons?month=${month}`, { headers })
      ).json()) as Grid;
      lessons.push(...grid.lessons);
    }
    const past = lessons
      .filter((l) => l.date < today)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
    expect(past.length).toBeGreaterThanOrEqual(2);

    // A new student who joined a month ago.
    const created = await page.request.post("/api/v1/students", {
      headers,
      data: {
        branchId: group.branchId,
        fullName: name,
        phone: `+99895${stamp.slice(-7)}`,
        gender: "FEMALE",
        membership: {
          groupId: group.id,
          joinedAt: shift(today, -30),
          customPrice: null,
          note: null,
          status: "ACTIVE",
        },
      },
    });
    expect(created.status()).toBe(201);
    const studentId = ((await created.json()) as { id: string }).id;
    const grid = (await (
      await page.request.get(`/api/v1/groups/${group.id}/lessons?month=${today.slice(0, 7)}`, {
        headers,
      })
    ).json()) as Grid;
    const membershipId = grid.members.find((m) => m.studentId === studentId)!.membershipId;

    // Absent at both lessons.
    for (const lesson of past.slice(0, 2)) {
      const marked = await page.request.put(`/api/v1/lessons/${lesson.id}/attendance`, {
        headers,
        data: { marks: [{ membershipId, status: "ABSENT" }] },
      });
      expect(marked.status()).toBe(204);
    }

    // The list shows them under Absences.
    await page.goto("/en/dashboard");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Absences" })
      .click();
    await expect(page).toHaveURL(/\/en\/absences/);
    await expect(page.getByRole("heading", { name: "Absences" })).toBeVisible();
    await expect(page.getByTestId("absences-summary-open")).toBeVisible();
    await page.goto(`/en/absences?q=${encodeURIComponent(name)}`);
    const row = page.getByTestId("absence-row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("GE-Morning A1");
    await expect(row.getByTestId("absence-reason")).toHaveText("2 lessons missed in a row");
    await expect(row).toContainText("Never marked present");
    await expect(row.getByTestId("absence-no-contact")).toBeVisible();
    await expect(page.getByTestId("absences-excel")).toBeVisible();

    // A call: the family says the student will come back.
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByTestId("absence-call").click();
    const dialog = page.getByTestId("absence-contact-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("absence-contact-phones")).toContainText("+99895");
    await dialog.getByLabel("Outcome").click();
    await page.getByRole("option", { name: "Will come back" }).click();
    await dialog.getByLabel("Note").fill("Back next week");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Will come back");
    await expect(row).toContainText("by Demo CEO");
    await expect(row.getByTestId("absence-no-contact")).toHaveCount(0);

    // The history keeps the note.
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByTestId("absence-history").click();
    const history = page.getByTestId("absence-history-dialog");
    await expect(history).toBeVisible();
    await expect(history.getByTestId("absence-contact")).toHaveCount(1);
    await expect(history).toContainText("Back next week");
    await page.keyboard.press("Escape");
    await expect(history).toBeHidden();

    // Back in class: the case closes as "Came back" and leaves the open list.
    const present = await page.request.put(`/api/v1/lessons/${past[0]!.id}/attendance`, {
      headers,
      data: { marks: [{ membershipId, status: "PRESENT" }] },
    });
    expect(present.status()).toBe(204);
    await page.goto(`/en/absences?q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("absence-row").filter({ hasText: name })).toHaveCount(0);
    await page.goto(`/en/absences?q=${encodeURIComponent(name)}&status=CLOSED`);
    const closed = page.getByTestId("absence-row").filter({ hasText: name });
    await expect(closed).toBeVisible();
    await expect(closed.getByTestId("absence-status")).toHaveText("Came back");

    // The rules live in the centre settings.
    await page.goto("/en/settings");
    await expect(page.getByTestId("absence-rules")).toBeVisible();
    await expect(page.getByLabel("Absences in a row")).toHaveValue("2");
    await expect(page.getByLabel("Days without a present mark")).toHaveValue("14");

    // Clean up so the test can run again.
    const removed = await page.request.delete(`/api/v1/students/${studentId}`, { headers });
    expect(removed.ok()).toBeTruthy();
  });
});
