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

const shift = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test.describe("waiting list (A-138)", () => {
  test("a lead joins the waiting list, a new group offers its seat and the person is enrolled", async ({
    page,
  }) => {
    await signIn(page, CEO_PHONE);
    const headers = await apiHeaders(page);
    const tag = `E2E Waitlist ${STAMP}`;

    // A course of its own, a one-seat room and a lead on the first board.
    const demo = (await (
      await page.request.get("/api/v1/groups?q=GE-Morning", { headers })
    ).json()) as { items: Array<{ name: string; branchId: string }> };
    const branchId = demo.items.find((g) => g.name === "GE-Morning A1")!.branchId;
    const course = await page.request.post("/api/v1/courses", {
      headers,
      data: { branchId, name: tag, price: 150000, durationMonths: 3, gradingSystemId: null },
    });
    expect(course.status()).toBe(201);
    const courseId = ((await course.json()) as { id: string }).id;
    const room = await page.request.post("/api/v1/rooms", {
      headers,
      data: { branchId, name: `${tag} room`, capacity: 1 },
    });
    expect(room.status()).toBe(201);
    const roomId = ((await room.json()) as { id: string }).id;
    const board = (await (await page.request.get("/api/v1/leads", { headers })).json()) as {
      board: { id: string } | null;
      columns: Array<{ id: string }>;
    };
    const leadName = `${tag} Lead`;
    const created = await page.request.post("/api/v1/leads", {
      headers,
      data: {
        columnId: board.columns[0]!.id,
        fullName: leadName,
        phones: [`+99897${STAMP.slice(-7)}`],
      },
    });
    expect(created.status()).toBe(201);
    const lead = (await created.json()) as { id: string; boardId: string };

    // "Add to waiting list" on the card, prefilled with the lead's name and phone.
    await page.goto(`/en/leads?board=${lead.boardId}&q=${encodeURIComponent(leadName)}`);
    const card = page.getByTestId("lead-card").filter({ hasText: leadName });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Actions for ${leadName}` }).click();
    await page.getByTestId("lead-waitlist").click();
    const dialog = page.getByTestId("waitlist-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("wl-name")).toHaveValue(leadName);
    await dialog.getByTestId("wl-course").click();
    await page.getByRole("option", { name: tag, exact: true }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toContainText("is on the waiting list");

    // The list page: the lead is first; a walk-in is added by hand and is second.
    await page.goto(`/en/leads/waitlist?courseId=${courseId}`);
    const rows = page.getByTestId("waitlist-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(leadName);
    await expect(rows.first().getByTestId("waitlist-row-status")).toHaveText("Waiting");
    await page.getByTestId("waitlist-add").click();
    const add = page.getByTestId("waitlist-dialog");
    await add.getByTestId("wl-course").click();
    await page.getByRole("option", { name: tag, exact: true }).click();
    await add.getByTestId("wl-name").fill(`${tag} Walk-in`);
    await add.getByTestId("wl-phone").fill(`+99898${STAMP.slice(-7)}`);
    await add.getByRole("button", { name: "Save" }).click();
    await expect(add).toBeHidden();
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("waitlist-summary-waiting")).toContainText("2");

    // A group of the course opens with the one-seat room: offering reaches the first in line.
    const group = await page.request.post("/api/v1/groups", {
      headers,
      data: {
        branchId,
        name: `${tag} Group`,
        courseId,
        gradingSystemId: null,
        weekdayPattern: "ODD",
        slots: [1, 3, 5].map((weekday) => ({
          weekday,
          startTime: "19:00",
          endTime: "20:30",
          roomId,
        })),
        teachers: [],
        startDate: shift(7),
        endDate: null,
        status: "ACTIVE",
      },
    });
    expect(group.status()).toBe(201);
    const groupId = ((await group.json()) as { id: string }).id;
    await page.goto(`/en/groups/${groupId}`);
    await page.getByTestId("group-more").click();
    await page.getByTestId("group-offer-seats").click();
    const offer = page.getByTestId("offer-seats-dialog");
    await expect(offer).toBeVisible();
    await expect(offer.getByTestId("offer-free-seats")).toHaveText("1");
    await expect(offer.getByTestId("offer-waiting")).toHaveText("2");
    await expect(offer.getByTestId("offer-next").getByRole("listitem")).toHaveCount(1);
    await expect(offer.getByTestId("offer-next")).toContainText(leadName);
    await offer.getByRole("button", { name: "Offer 1 seat" }).click();
    await expect(offer).toBeHidden();
    await expect(page.getByTestId("group-notice")).toContainText("1 offered");

    // Offered shows on the list; enrolling puts the lead into the group and closes the entry.
    await page.goto(`/en/leads/waitlist?courseId=${courseId}`);
    const offered = page.getByTestId("waitlist-row").filter({ hasText: leadName });
    await expect(offered.getByTestId("waitlist-row-status")).toHaveText("Offered");
    await expect(offered).toContainText(`${tag} Group`);
    await offered.getByRole("button", { name: `Actions for ${leadName}` }).click();
    await page.getByTestId("waitlist-enrol").click();
    const enrol = page.getByTestId("waitlist-enrol-dialog");
    await expect(enrol).toBeVisible();
    // The offered group is preselected.
    await expect(enrol.getByTestId("wl-group")).toContainText(`${tag} Group`);
    await enrol.getByRole("button", { name: "Enrol in a group" }).click();
    await expect(enrol).toBeHidden();
    await expect(page.getByTestId("waitlist-notice")).toContainText("joined the group");
    await expect(page.getByTestId("waitlist-row")).toHaveCount(1);
    await page.goto(`/en/leads/waitlist?courseId=${courseId}&status=ENROLLED`);
    await expect(page.getByTestId("waitlist-row").filter({ hasText: leadName })).toBeVisible();
    const members = (await (
      await page.request.get(`/api/v1/groups/${groupId}/members`, { headers })
    ).json()) as Array<{ fullName?: string; student?: { fullName: string } }>;
    expect(JSON.stringify(members)).toContain(leadName);

    // Tidy up: the group out of the way of other runs.
    await page.request.delete(`/api/v1/groups/${groupId}`, { headers });
  });
});
