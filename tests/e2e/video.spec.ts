import { expect, test, type Page } from "@playwright/test";

const TEACHER_PHONE = "+998900000004";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

// Chromium's fake camera and microphone, no permission prompt, and plain host
// candidates (no mDNS) so two browsers on one machine can connect without STUN.
test.use({
  permissions: ["camera", "microphone"],
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  },
});

async function signIn(page: Page, phone: string) {
  await page.goto("/en/login");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|groups|today)/);
}

/** A tiny PDF with `count` A4 pages, one blue bar per page at a different height. */
function pdfWithPages(count: number): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${count} >>`,
  ];
  for (let i = 0; i < count; i++) {
    const content = `0.15 0.39 0.92 rg 60 ${700 - i * 150} 320 80 re f`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + i * 2} 0 R /Resources << >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Two seconds of a quiet tone as a WAV file. */
function wavTone(seconds = 2): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const out = Buffer.alloc(44 + samples * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + samples * 2, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    out.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 3000), 44 + i * 2);
  }
  return out;
}

test.describe("video lessons", () => {
  test("a teacher starts a group's call and a student joins from their link", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;

    const card = teacher.getByTestId("group-video");
    await expect(card).toContainText("Video lesson");
    // A call left open by an earlier run is joined instead of started.
    if (await card.getByTestId("video-start").isVisible()) {
      await card.getByTestId("video-start").click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher).toHaveURL(/\/en\/video\/[a-z0-9]+/);
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();
    await expect(teacher.getByTestId("tile-self")).toBeVisible();

    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    expect(links.ok()).toBe(true);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    expect(first).toBeTruthy();

    // The student has no account: just the personal link.
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("class-title")).toHaveText(`Hello, ${first!.fullName}`);
    await expect(student.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await student.getByTestId("join-call").click();
    await expect(student.getByTestId("call-room")).toBeVisible();

    // Both browsers see each other and the connection comes up.
    for (const page of [teacher, student]) {
      await expect(page.getByTestId("call-count")).toHaveText("2 people in the lesson", {
        timeout: 20_000,
      });
      const peer = page.getByTestId("tile-peer");
      await expect(peer).toHaveCount(1);
      await expect(peer).not.toContainText("Connecting", { timeout: 30_000 });
      await expect(peer).not.toContainText("Could not connect");
    }
    await expect(student.getByTestId("tile-peer")).toContainText("Demo Teacher");

    // Muting shows on the other side.
    await student.getByTestId("toggle-mic").click();
    await expect(teacher.getByTestId("tile-peer").getByLabel("Microphone off")).toBeVisible({
      timeout: 10_000,
    });

    // A raised hand shows on the teacher's screen.
    await student.getByTestId("toggle-mic").click();
    await student.getByTestId("toggle-hand").click();
    await expect(teacher.getByTestId("tile-peer").getByTestId("hand-mark")).toBeVisible({
      timeout: 10_000,
    });

    // Chat goes both ways; the student sees an unread badge first.
    await teacher.getByTestId("toggle-chat").click();
    await teacher.getByTestId("chat-input").fill("Open page 12");
    await teacher.getByTestId("chat-send").click();
    await expect(teacher.getByTestId("chat-message")).toContainText("Open page 12");
    await expect(student.getByTestId("chat-unread")).toHaveText("1", { timeout: 10_000 });
    await student.getByTestId("toggle-chat").click();
    await expect(student.getByTestId("chat-message")).toContainText("Open page 12");
    await expect(student.getByTestId("chat-unread")).toHaveCount(0);
    await student.getByTestId("chat-input").fill("Done");
    await student.getByTestId("chat-input").press("Enter");
    await expect(teacher.getByTestId("chat-message")).toHaveCount(2, { timeout: 10_000 });

    // The teacher switches everyone's microphone off.
    await expect(student.getByTestId("toggle-mic")).toHaveAttribute(
      "aria-label",
      "Turn microphone off",
    );
    await teacher.getByTestId("mute-all").click();
    await expect(student.getByTestId("muted-notice")).toContainText("Demo Teacher", {
      timeout: 10_000,
    });
    await expect(student.getByTestId("toggle-mic")).toHaveAttribute(
      "aria-label",
      "Turn microphone on",
    );

    // Hand queue: the teacher sees the raised hand in order and lowers it (A-152).
    await expect(teacher.getByTestId("hand-count")).toHaveText("1");
    await teacher.getByTestId("toggle-people").click();
    const queue = teacher.getByTestId("hand-queue");
    await expect(queue.getByTestId("hand-queue-item")).toContainText(first!.fullName);
    await queue.getByTestId("lower-hand").click();
    await expect(student.getByTestId("lowered-notice")).toContainText("Demo Teacher", {
      timeout: 10_000,
    });
    await expect(student.getByTestId("toggle-hand")).toHaveAttribute("aria-label", "Raise hand");
    await expect(teacher.getByTestId("hand-queue")).toHaveCount(0, { timeout: 10_000 });

    // Reactions float on the sender's picture; "slower" reaches only the teacher's tally.
    await student.getByTestId("toggle-reactions").click();
    await student.getByTestId("react-clap").click();
    await expect(teacher.getByTestId("tile-peer").getByTestId("reaction-mark")).toHaveText("👏", {
      timeout: 10_000,
    });
    await student.getByTestId("toggle-reactions").click();
    await student.getByTestId("react-slower").click();
    await expect(teacher.getByTestId("pace-tally")).toContainText("1 slower", { timeout: 10_000 });
    await expect(teacher.getByTestId("toggle-reactions")).toBeVisible();
    await teacher.getByTestId("toggle-reactions").click();
    await expect(teacher.getByTestId("react-slower")).toHaveCount(0);
    await teacher.getByTestId("toggle-reactions").click();

    // The whiteboard takes everyone's stage; students draw only when allowed (A-155).
    await teacher.getByTestId("toggle-board").click();
    await expect(teacher.getByTestId("whiteboard")).toBeVisible({ timeout: 10_000 });
    await expect(student.getByTestId("whiteboard")).toBeVisible({ timeout: 10_000 });
    await expect(student.getByTestId("board-eraser")).toHaveCount(0);
    const canvas = teacher.getByTestId("board-canvas");
    const box = (await canvas.boundingBox())!;
    await teacher.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await teacher.mouse.down();
    await teacher.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
    await teacher.mouse.up();
    await expect(teacher.getByTestId("board-undo")).toBeEnabled();
    await teacher.getByTestId("board-students-draw").click();
    await expect(student.getByTestId("board-eraser")).toBeVisible({ timeout: 10_000 });
    await teacher.getByTestId("board-save").click();
    await expect(teacher.getByTestId("board-save")).toContainText("Saved", { timeout: 15_000 });
    await teacher.getByTestId("toggle-board").click();
    await expect(student.getByTestId("whiteboard")).toHaveCount(0, { timeout: 10_000 });

    // Breakout rooms: the student is seated alone in a room, hears the notice, comes back (A-156).
    await teacher.getByTestId("toggle-breakout").click();
    const rooms = teacher.getByTestId("breakout-panel");
    await expect(rooms).toBeVisible({ timeout: 10_000 });
    await rooms.getByTestId("breakout-rooms").selectOption("2");
    await rooms.getByTestId("breakout-start").click();
    await expect(rooms.getByTestId("breakout-list")).toBeVisible({ timeout: 10_000 });
    await expect(student.getByTestId("breakout-notice-bar")).toContainText("room 1", {
      timeout: 10_000,
    });
    await expect(student.getByTestId("breakout-countdown")).toBeVisible();
    await expect(teacher.getByTestId("breakout-notice-bar")).toContainText("main room");
    await rooms.getByTestId("breakout-notice").fill("Two minutes left");
    await rooms.getByTestId("breakout-notice-send").click();
    await expect(student.getByTestId("host-notice")).toContainText("Two minutes left", {
      timeout: 10_000,
    });
    await student.getByTestId("host-notice").click();
    await expect(student.getByTestId("host-notice")).toHaveCount(0);
    await rooms.getByTestId("breakout-end").click();
    await expect(student.getByTestId("breakout-notice-bar")).toHaveCount(0, { timeout: 10_000 });
    await expect(rooms.getByTestId("breakout-start")).toBeVisible({ timeout: 10_000 });
    await teacher.getByTestId("toggle-breakout").click();

    // The lesson panel: the teacher sets today's topic, the student reads it (A-154).
    await teacher.getByTestId("toggle-lesson").click();
    const lessonPanel = teacher.getByTestId("lesson-panel");
    await expect(lessonPanel).toBeVisible({ timeout: 10_000 });
    if (await lessonPanel.getByTestId("lesson-topic-edit").isVisible()) {
      await lessonPanel.getByTestId("lesson-topic-edit").click();
      await lessonPanel.getByTestId("lesson-topic-input").fill("Present perfect");
      await lessonPanel.getByTestId("lesson-topic-save").click();
      await expect(lessonPanel.getByTestId("lesson-topic")).toHaveText("Present perfect", {
        timeout: 10_000,
      });
      await student.getByTestId("toggle-lesson").click();
      await expect(student.getByTestId("lesson-topic")).toHaveText("Present perfect", {
        timeout: 10_000,
      });
      await student.getByTestId("toggle-lesson").click();
    }
    await teacher.getByTestId("toggle-lesson").click();

    // A poll: the student answers, the teacher sees the count and closes it (A-153).
    await teacher.getByTestId("toggle-poll").click();
    // A call left open by an earlier run may already hold a poll.
    if (await teacher.getByTestId("poll-new").isVisible()) {
      await teacher.getByTestId("poll-new").click();
    }
    await teacher.getByTestId("poll-question-input").fill("Ready for the test?");
    const optionInputs = teacher.getByTestId("poll-option-input");
    await optionInputs.nth(0).fill("Yes");
    await optionInputs.nth(1).fill("Not yet");
    await teacher.getByTestId("poll-open").click();
    await expect(teacher.getByTestId("poll-question")).toHaveText("Ready for the test?", {
      timeout: 10_000,
    });
    await expect(student.getByTestId("poll-notice")).toContainText("Ready for the test?", {
      timeout: 10_000,
    });
    await student.getByTestId("poll-notice").click();
    await student.getByTestId("poll-option").nth(1).click();
    await expect(student.getByTestId("poll-total")).toContainText("Answer sent", {
      timeout: 10_000,
    });
    await expect(teacher.getByTestId("poll-total")).toContainText("1 answer", { timeout: 10_000 });
    await teacher.getByTestId("poll-close").click();
    await expect(student.getByTestId("poll-result").nth(1)).toContainText("1", {
      timeout: 10_000,
    });
    await teacher.getByTestId("toggle-people").click();

    // Spotlight and focus mode reach the student's screen.
    await teacher
      .getByTestId("people-panel")
      .getByRole("button", { name: `Show ${first!.fullName} large to everyone` })
      .click();
    await expect(student.getByTestId("tile-self").getByTestId("spotlight-mark")).toBeVisible({
      timeout: 10_000,
    });
    await teacher.getByTestId("toggle-focus").click();
    await expect(student.getByTestId("focus-notice")).toContainText("focus mode", {
      timeout: 10_000,
    });
    await teacher.getByTestId("toggle-focus").click();
    await expect(student.getByTestId("focus-notice")).toHaveCount(0, { timeout: 10_000 });

    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toContainText("The video lesson has ended.");
    await expect(student.getByTestId("call-done")).toContainText("The video lesson has ended.", {
      timeout: 15_000,
    });

    await teacher.goto(`/en/groups/${groupId}`);
    await expect(teacher.getByTestId("video-start")).toBeVisible();
    await expect(teacher.getByTestId("video-last")).toContainText("1 student joined");
    // On a lesson day the call belongs to the lesson and proposes its attendance (B1).
    const last = teacher.getByTestId("video-last");
    await last.locator("summary").click();
    await expect(last.getByTestId("video-polls")).toContainText("Ready for the test?");
    // The saved board is a material of the group.
    await teacher.goto(`/en/groups/${groupId}?tab=materials`);
    await expect(teacher.getByText(/Whiteboard ·/).first()).toBeVisible();
    if (await last.getByTestId("video-attendance").isVisible()) {
      await last.getByTestId("video-attendance").click();
      const dialog = teacher.getByTestId("call-attendance");
      await expect(dialog).toContainText(first!.fullName);
      await expect(dialog.getByTestId("call-attendance-row").first()).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }

    await studentContext.close();
    await teacherContext.close();
  });

  test("on a tablet without screen capture the room explains and offers the whiteboard", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    // An iPad in portrait: touch, no getDisplayMedia (A-182).
    const context = await browser.newContext({
      viewport: { width: 820, height: 1180 },
      hasTouch: true,
    });
    await context.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, "getDisplayMedia", { value: undefined });
    });
    const teacher = await context.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    const card = teacher.getByTestId("group-video");
    const start = card.getByTestId("video-start");
    await expect(start.or(card.getByTestId("video-join"))).toBeVisible();
    if (await start.isVisible()) {
      await start.click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();

    await expect(teacher.getByTestId("toggle-share")).toHaveCount(0);
    // Chromium's fake device is a single camera, so there is nothing to switch to.
    await expect(teacher.getByTestId("switch-camera")).toHaveCount(0);
    await teacher.getByTestId("share-unavailable-button").click();
    const notice = teacher.getByTestId("share-unavailable");
    await expect(notice).toContainText("This browser cannot share the screen");
    await notice.getByTestId("share-use-board").click();
    await expect(notice).toHaveCount(0);
    await expect(teacher.getByTestId("whiteboard")).toBeVisible();
    await teacher.getByTestId("toggle-board").click();
    await teacher.getByTestId("share-unavailable-button").click();
    await notice.getByTestId("share-use-lesson").click();
    await expect(teacher.getByTestId("lesson-panel")).toBeVisible();

    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toContainText("The video lesson has ended.");
    await context.close();
  });

  test("a teacher shows a file to everyone: pages turn, the pen draws, audio plays in step", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const stamp = Date.now();
    // The teacher on a tablet without screen capture, the student on a phone (A-183).
    const teacherContext = await browser.newContext({
      viewport: { width: 1180, height: 820 },
      hasTouch: true,
    });
    await teacherContext.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, "getDisplayMedia", { value: undefined });
    });
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const card = teacher.getByTestId("group-video");
    const start = card.getByTestId("video-start");
    await expect(start.or(card.getByTestId("video-join"))).toBeVisible();
    if (await start.isVisible()) {
      await start.click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();

    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string; fullName: string }>;
    const studentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const student = await studentContext.newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await student.getByTestId("join-call").click();
    await expect(student.getByTestId("call-room")).toBeVisible();
    await expect(teacher.getByTestId("call-count")).toHaveText("2 people in the lesson", {
      timeout: 20_000,
    });

    // The share notice now leads to "show a file": the lesson panel with the upload button.
    await teacher.getByTestId("share-unavailable-button").click();
    await teacher.getByTestId("share-unavailable").getByTestId("share-use-lesson").click();
    const panel = teacher.getByTestId("lesson-panel");
    await expect(panel.getByTestId("lesson-show-file")).toBeVisible({ timeout: 10_000 });
    await panel.getByTestId("lesson-show-file-input").setInputFiles({
      name: `Unit 3 slides ${stamp}.pdf`,
      mimeType: "application/pdf",
      buffer: pdfWithPages(3),
    });

    // Everyone gets the first page; only the teacher has the page buttons.
    for (const page of [teacher, student]) {
      const stage = page.getByTestId("material-stage");
      await expect(stage).toHaveAttribute("data-view", "pdf", { timeout: 20_000 });
      await expect(stage.getByTestId("material-title")).toHaveText(`Unit 3 slides ${stamp}`);
      await expect(stage.getByTestId("material-page")).toHaveText("1 / 3", { timeout: 20_000 });
      await expect(stage.getByTestId("material-pdf-page")).toHaveAttribute("data-page", "1");
    }
    await expect(student.getByTestId("material-next")).toHaveCount(0);
    await expect(student.getByTestId("material-stop")).toHaveCount(0);
    await expect(teacher.getByTestId("material-prev")).toBeDisabled();

    // The file is a material of the group now, marked as shown in the panel.
    const row = panel.getByTestId("lesson-material").filter({ hasText: `Unit 3 slides ${stamp}` });
    await expect(row).toHaveAttribute("data-shown", "true");

    // A page turn reaches the phone.
    await teacher.getByTestId("material-next").click();
    await expect(student.getByTestId("material-page")).toHaveText("2 / 3", { timeout: 10_000 });
    await expect(student.getByTestId("material-pdf-page")).toHaveAttribute("data-page", "2");
    await teacher.getByTestId("material-next").click();
    await expect(teacher.getByTestId("material-next")).toBeDisabled();
    await expect(student.getByTestId("material-page")).toHaveText("3 / 3", { timeout: 10_000 });

    // The pen draws over the page; the student sees the marks but has no tools.
    await teacher.getByTestId("material-pen").click();
    const canvas = teacher.getByTestId("board-canvas");
    await expect(canvas).toBeVisible();
    await expect(teacher.getByTestId("whiteboard")).toHaveCount(0);
    const box = (await canvas.boundingBox())!;
    await teacher.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await teacher.mouse.down();
    await teacher.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 });
    await teacher.mouse.up();
    await expect(teacher.getByTestId("board-undo")).toBeEnabled();
    await expect(student.getByTestId("board-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(student.getByTestId("material-stage")).toBeVisible();
    await expect(student.getByTestId("board-eraser")).toHaveCount(0);
    // Marks belong to their page: the previous page is clean, and coming back finds them.
    await teacher.getByTestId("material-prev").click();
    await expect(teacher.getByTestId("material-page")).toHaveText("2 / 3");
    await expect(teacher.getByTestId("board-undo")).toBeDisabled();
    await teacher.getByTestId("material-next").click();
    await expect(teacher.getByTestId("board-undo")).toBeEnabled();
    await teacher.getByTestId("material-pen").click();
    await expect(student.getByTestId("board-canvas")).toHaveCount(0, { timeout: 10_000 });

    // The whiteboard still takes the stage over the material, and gives it back.
    await teacher.getByTestId("toggle-board").click();
    await expect(teacher.getByTestId("board-canvas")).toBeVisible();
    await teacher.getByTestId("toggle-board").click();

    // An audio file plays in step: the teacher presses play, the phone follows.
    await teacher.getByTestId("toggle-present").click();
    await expect(student.getByTestId("material-stage")).toHaveCount(0, { timeout: 10_000 });
    await teacher.getByTestId("toggle-present").click();
    await expect(panel).toBeVisible();
    await panel.getByTestId("lesson-show-file-input").setInputFiles({
      name: `Listening ${stamp}.wav`,
      mimeType: "audio/wav",
      buffer: wavTone(20),
    });
    for (const page of [teacher, student]) {
      await expect(page.getByTestId("material-stage")).toHaveAttribute("data-view", "audio", {
        timeout: 20_000,
      });
    }
    await expect(student.getByTestId("material-media-status")).toContainText(
      "Paused by the teacher",
    );
    await teacher.getByTestId("material-media").evaluate((el: HTMLVideoElement) => el.play());
    await expect(student.getByTestId("material-media-status")).toContainText("playing", {
      timeout: 10_000,
    });
    // The student's page is under the student app's service worker, which must leave the
    // file to the network (byte ranges); Chromium lets a page that holds the microphone
    // start sound by itself.
    await expect
      .poll(
        () =>
          student
            .getByTestId("material-media")
            .evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0),
        { timeout: 15_000 },
      )
      .toBe(true);
    await teacher.getByTestId("material-media").evaluate((el: HTMLVideoElement) => el.pause());
    await expect
      .poll(
        () => student.getByTestId("material-media").evaluate((el: HTMLVideoElement) => el.paused),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Showing an older material from the list replaces the audio; stopping clears every stage.
    await row.getByTestId("lesson-material-show").click();
    await expect(student.getByTestId("material-stage")).toHaveAttribute("data-view", "pdf", {
      timeout: 10_000,
    });
    await teacher.getByTestId("material-stop").click();
    await expect(teacher.getByTestId("material-stage")).toHaveCount(0);
    await expect(student.getByTestId("material-stage")).toHaveCount(0, { timeout: 10_000 });

    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toContainText("The video lesson has ended.");
    await studentContext.close();
    await teacherContext.close();
  });

  test("a shared screen goes out with its sound, and the microphone still works after", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const teacherContext = await browser.newContext();
    // A headless browser has no screen picker: a drawn picture and a tone stand in for the
    // screen and its sound, which Chromium captures when "share audio" is ticked (A-184).
    await teacherContext.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, "getDisplayMedia", {
        value: async (options?: DisplayMediaStreamOptions) => {
          (window as unknown as { shareAsked?: unknown }).shareAsked = options?.audio;
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const context = canvas.getContext("2d")!;
          setInterval(() => {
            context.fillStyle = `hsl(${Date.now() % 360} 80% 50%)`;
            context.fillRect(0, 0, 640, 360);
          }, 100);
          const audio = new AudioContext();
          const tone = audio.createOscillator();
          const out = audio.createMediaStreamDestination();
          tone.connect(out);
          tone.start();
          return new MediaStream([
            ...canvas.captureStream(10).getVideoTracks(),
            ...out.stream.getAudioTracks(),
          ]);
        },
      });
    });
    const teacher = await teacherContext.newPage();
    const errors: string[] = [];
    teacher.on("pageerror", (e) => errors.push(e.message));
    await signIn(teacher, TEACHER_PHONE);
    await teacher.goto("/en/groups");
    await teacher.getByRole("link", { name: "GE-Morning A1" }).first().click();
    await expect(teacher.getByTestId("group-title")).toHaveText("GE-Morning A1");
    const groupId = teacher.url().match(/groups\/([a-z0-9]+)/)![1]!;
    const card = teacher.getByTestId("group-video");
    const start = card.getByTestId("video-start");
    await expect(start.or(card.getByTestId("video-join"))).toBeVisible();
    if (await start.isVisible()) {
      await start.click();
    } else {
      await card.getByTestId("video-join").click();
    }
    await expect(teacher.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await teacher.getByTestId("join-call").click();
    await expect(teacher.getByTestId("call-room")).toBeVisible();

    const links = await teacher.request.get(`/api/v1/groups/${groupId}/video/links`);
    const [first] = (await links.json()) as Array<{ token: string }>;
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await student.goto(`/en/class/${first!.token}`);
    await expect(student.getByTestId("join-call")).toBeEnabled({ timeout: 20_000 });
    await student.getByTestId("join-call").click();
    await expect(student.getByTestId("call-room")).toBeVisible();
    const peer = student.getByTestId("tile-peer");
    await expect(peer).toHaveCount(1, { timeout: 20_000 });
    await expect(peer).not.toContainText("Connecting", { timeout: 30_000 });

    /** The state of the sound track the student gets from the teacher. */
    const heard = () =>
      student.evaluate(async () => {
        const video = document.querySelector<HTMLVideoElement>("[data-testid=tile-peer] video");
        const track = (video?.srcObject as MediaStream | null)?.getAudioTracks()[0];
        return track ? `${track.readyState}:${track.muted}` : "none";
      });
    expect(await heard()).toBe("live:false");

    await teacher.getByTestId("toggle-share").click();
    await expect(teacher.getByTestId("toggle-share")).toHaveAttribute("aria-label", "Stop sharing");
    expect(
      await teacher.evaluate(() => (window as unknown as { shareAsked?: unknown }).shareAsked),
    ).toBe(true);
    await expect(peer.getByLabel("Sharing screen")).toBeVisible({ timeout: 10_000 });
    // The student's connection carries on with the mixed sound: same live track, no renegotiation.
    expect(await heard()).toBe("live:false");

    await teacher.getByTestId("toggle-share").click();
    await expect(teacher.getByTestId("toggle-share")).toHaveAttribute("aria-label", "Share screen");
    await expect(peer.getByLabel("Sharing screen")).toHaveCount(0, { timeout: 10_000 });
    // Back on the plain microphone: muting still shows on the other side.
    await teacher.getByTestId("toggle-mic").click();
    await expect(peer.getByLabel("Microphone off")).toBeVisible({ timeout: 10_000 });
    expect(await heard()).toBe("live:false");
    expect(errors).toEqual([]);

    await teacher.getByTestId("end-call").click();
    await teacher
      .getByRole("alertdialog")
      .getByRole("button", { name: "End for everyone" })
      .click();
    await expect(teacher.getByTestId("call-done")).toContainText("The video lesson has ended.");
    await studentContext.close();
    await teacherContext.close();
  });

  test("a wrong class link shows the not-found page", async ({ page }) => {
    const response = await page.goto("/en/class/this-link-does-not-exist-000");
    expect(response?.status()).toBe(404);
  });
});
