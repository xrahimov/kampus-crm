import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
const STAMP = String(Date.now());

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|today)/);
}

async function apiHeaders(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": cookies.find((c) => c.name === "kampus_csrf")?.value ?? "",
    "content-type": "application/json",
  };
}

/** The calendar day in Tashkent (UTC+5), which is what Today shows. */
const todayTashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

test.describe("attendance by QR (A-139)", () => {
  test("a badge code typed by a hand scanner marks the student present on today's lesson", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const today = todayTashkent();
    const tag = `E2E Scan ${STAMP}`;

    // A group meeting every day with one student, so the day has a lesson whatever the weekday.
    const demo = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ name: string; branchId: string }> };
    const branchId = demo.items.find((g) => g.name === "GE-Morning A1")!.branchId;
    const course = await page.request.post("/api/v1/courses", {
      headers,
      data: { branchId, name: tag, price: 100000, durationMonths: 1, gradingSystemId: null },
    });
    const courseId = ((await course.json()) as { id: string }).id;
    const group = await page.request.post("/api/v1/groups", {
      headers,
      data: {
        branchId,
        name: tag,
        courseId,
        gradingSystemId: null,
        weekdayPattern: "CUSTOM",
        slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          startTime: "05:00",
          endTime: "05:45",
          roomId: null,
        })),
        teachers: [],
        startDate: today,
        endDate: null,
        status: "ACTIVE",
      },
    });
    expect(group.status()).toBe(201);
    const groupId = ((await group.json()) as { id: string }).id;
    const student = await page.request.post("/api/v1/students", {
      headers,
      data: {
        branchId,
        fullName: `${tag} Student`,
        phone: `+99899${STAMP.slice(-7)}`,
        gender: "MALE",
        membership: { groupId, joinedAt: today, customPrice: null, note: null, status: "ACTIVE" },
      },
    });
    expect(student.status()).toBe(201);
    const studentId = ((await student.json()) as { id: string }).id;

    // From the lesson card on Today to the scan page for that lesson.
    await page.goto("/en/today");
    const card = page.getByTestId("today-lesson").filter({ hasText: tag });
    await expect(card).toBeVisible();
    await card.getByTestId("today-scan").click();
    await expect(page).toHaveURL(/\/en\/today\/scan\?lesson=/);
    await expect(page.getByTestId("scan-target")).toContainText(tag);

    // A hand scanner types the code and presses Enter.
    const field = page.getByTestId("scan-code");
    await field.fill(`kampus:student:${studentId}`);
    await field.press("Enter");
    const line = page.getByTestId("scan-line").first();
    await expect(line).toHaveAttribute("data-status", "marked");
    await expect(line).toContainText(`${tag} Student`);
    await expect(page.getByTestId("scan-count")).toContainText("1 marked present");

    // The same badge again: already present. Junk: not a badge.
    await field.fill(`kampus:student:${studentId}`);
    await field.press("Enter");
    await expect(page.getByTestId("scan-line").first()).toHaveAttribute("data-status", "already");
    await field.fill("hello");
    await field.press("Enter");
    await expect(page.getByTestId("scan-line").first()).toHaveAttribute("data-status", "unknown");
    await expect(page.getByTestId("scan-line")).toHaveCount(3);

    // Today shows the mark.
    await page.goto("/en/today");
    await expect(card.getByTestId("today-member").first()).toHaveAttribute(
      "data-status",
      "PRESENT",
    );

    await page.request.delete(`/api/v1/groups/${groupId}`, { headers });
  });
});
