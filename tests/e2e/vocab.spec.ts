import { expect, test, type Page } from "@playwright/test";

const CEO_PHONE = "+998900000001";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

/** The syllabus dialog of the Central "General English" course. */
async function openSyllabus(page: Page) {
  await page.goto("/en/settings/courses?q=General%20English");
  const row = page.getByTestId("course-row").filter({ hasText: "Central" }).first();
  await row.getByRole("button", { name: "Actions for General English" }).click();
  await page.getByTestId("course-syllabus").click();
  const dialog = page.getByTestId("syllabus-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("syllabus-text")).toBeEnabled();
  return dialog;
}

test.describe("vocabulary trainer (A-165)", () => {
  test("words on a topic become the student's flashcards", async ({ browser }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const page = await (await browser.newContext()).newPage();
    await signIn(page, CEO_PHONE);

    // A one-topic syllabus for the course, remembering what was there.
    let dialog = await openSyllabus(page);
    const previous = await page.getByTestId("syllabus-text").inputValue();
    await page.getByTestId("syllabus-text").fill(`Food ${stamp}\n`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // Words on the topic, then open it to the group now.
    await page.goto("/en/groups");
    await page.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(page.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = page.url().match(/groups\/([a-z0-9]+)/)![1]!;
    await page.getByTestId("tab-syllabus").click();
    const topic = page.getByTestId("syllabus-topic").filter({ hasText: `Food ${stamp}` });
    await topic.getByTestId("syllabus-content").click();
    const content = page.getByTestId("topic-content-dialog");
    await expect(content).toBeVisible();
    const panel = content.getByTestId("words-panel");
    await panel
      .getByTestId("words-text")
      .fill("apple — olma — I eat an apple.\npear — nok\nplum — olxo'ri");
    await panel.getByTestId("words-save").click();
    await expect(panel.getByTestId("words-count")).toHaveText("3 words");
    await content.getByRole("button", { name: "Cancel" }).click();
    await expect(content).toBeHidden();
    await topic.getByTestId("syllabus-release").click();
    await page.getByRole("option", { name: "Open now" }).click();
    await expect(topic.getByTestId("syllabus-open")).toBeVisible();

    // The student practises: flip, know one, miss one, finish the run.
    const links = await page.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string }>;
    const student = await (await browser.newContext()).newPage();
    await student.goto(`/en/class/${first!.token}`);
    await student.getByTestId("portal-tab-course").click();
    const card = student.getByTestId("portal-vocab");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("vocab-learned")).toHaveText("0 of 3 learned");
    await expect(card.getByTestId("vocab-due")).toHaveText("3 to review");
    await card.getByTestId("vocab-start").click();
    const run = card.getByTestId("vocab-run");
    await expect(run.getByTestId("vocab-term")).toHaveText("apple");
    await expect(run.getByTestId("vocab-translation")).toHaveCount(0);
    await run.getByTestId("vocab-flip").click();
    await expect(run.getByTestId("vocab-translation")).toContainText("olma");
    await run.getByTestId("vocab-known").click();
    await expect(card.getByTestId("vocab-streak")).toHaveText(/1 day in a row/);
    await expect(run.getByTestId("vocab-term")).toHaveText("pear");
    await run.getByTestId("vocab-flip").click();
    await run.getByTestId("vocab-again").click();
    // plum, then pear comes round again at the end of the run.
    await expect(run.getByTestId("vocab-term")).toHaveText("plum");
    await run.getByTestId("vocab-flip").click();
    await run.getByTestId("vocab-known").click();
    await expect(run.getByTestId("vocab-term")).toHaveText("pear");
    await run.getByTestId("vocab-flip").click();
    await run.getByTestId("vocab-known").click();
    await expect(card.getByTestId("vocab-done")).toBeVisible();
    await expect(card.getByTestId("vocab-due")).toHaveText("nothing due");

    // Put the course's syllabus back as it was.
    dialog = await openSyllabus(page);
    await page.getByTestId("syllabus-text").fill(previous);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  });
});
