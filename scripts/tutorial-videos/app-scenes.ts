/**
 * What is done on screen in the videos of the phone app (A-229): the app's own
 * sign-in, where installing it is the first step. They are filmed in the app's
 * browser build (`mobile/`: `npm run export:web`, served by
 * `scripts/serve-web.mjs` beside the demo server), at a phone's width, as
 * upright videos. What is said about each step is in `words/<locale>.ts` under
 * `appVideos`. Demo data only: names and numbers here are made up.
 */
import type { Page } from "@playwright/test";

import { DEMO, getJson, mutate } from "../help-screenshots";

import { BASE, type Shoot } from "./shoot";
import type { AppVideoId } from "./words";

/** Where the app's browser build is served; its `/api` goes on to the demo server. */
export const APP_BASE = (process.env.VIDEO_APP_URL ?? "http://localhost:8090").replace(/\/+$/, "");

export interface AppScene {
  id: AppVideoId;
  run(shoot: Shoot): Promise<void>;
}

/** The made-up people of the app's videos; not the ones of the site's videos, so both sets can be recorded on one database. */
const CAST = {
  teacher: { name: "Dilnoza Karimova", phone: "+998905557788", password: "Registon-2026" },
};
/** The demo student the seed makes. */
const STUDENT = "+998911000001";

/** The bot hears "Share my number" from `phone`: what Telegram delivers when a person presses it. */
async function shareNumber(page: Page, phone: string, name: string) {
  const id = Number(phone.slice(-9));
  await page.request.post(`${BASE}/api/v1/webhooks/telegram?secret=${DEMO.botSecret}`, {
    data: {
      message: {
        chat: { id },
        from: { id, first_name: name, language_code: "uz" },
        contact: { phone_number: phone.slice(1), user_id: id },
      },
    },
  });
}

/**
 * A phone's home screen with the Kampus app on it: where a video of the app
 * starts. Drawn here, like the opening card; no real phone or store is shown.
 */
function homeScreen(): string {
  const others = ["#5b8def", "#f2a33a", "#3fbf7f", "#e2607a", "#8b6fe8", "#4cc3d9", "#f08a4b"];
  const icon = (color: string) =>
    `<div class="app"><div class="icon" style="background:${color}"></div><div class="name"></div></div>`;
  return `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; }
    body { font-family: system-ui, sans-serif; overflow: hidden;
      background: linear-gradient(160deg, #24306b 0%, #1b2452 45%, #10173a 100%); }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 26px 0; padding: 72px 22px 0; }
    .app { display: grid; justify-items: center; gap: 8px; }
    .icon { width: 64px; height: 64px; border-radius: 16px; opacity: .5; }
    .name { width: 44px; height: 8px; border-radius: 4px; background: rgb(255 255 255 / .22); }
    #kampus .icon { opacity: 1; background: #35c2b6; display: grid; place-items: center;
      box-shadow: 0 6px 18px rgb(0 0 0 / .35); }
    #kampus .name { width: auto; height: auto; background: none; color: #fff; font-size: 13px; font-weight: 600; }
    .dock { position: absolute; left: 18px; right: 18px; bottom: 22px; height: 92px; border-radius: 30px;
      background: rgb(255 255 255 / .12); }
  </style>
  <div class="grid">
    ${others.slice(0, 5).map(icon).join("")}
    <div class="app" id="kampus" data-testid="kampus-app"><div class="icon">
      <svg viewBox="0 0 32 32" width="46" height="46">
        <path d="M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z" fill="#1B2452"/>
        <circle cx="16" cy="16" r="3" fill="#35c2b6"/></svg></div><div class="name">Kampus</div></div>
    ${others.slice(5).map(icon).join("")}
  </div>
  <div class="dock"></div>`;
}

/** The first step of every app video: the app on the phone, pressed, and its first screen. */
async function install(s: Shoot) {
  const { film, page } = s;
  await film.offCamera(async () => {
    await page.setContent(homeScreen());
  });
  await s.say("install", async () => {
    const app = page.getByTestId("kampus-app");
    await film.show(app, 2);
    return async () => {
      await film.click(app);
      await s.go("/");
      await page.getByTestId("door").waitFor();
    };
  });
}

const signIn: AppScene = {
  id: "sign-in",
  async run(s) {
    const { film, page } = s;
    const who = CAST.teacher;
    // Backstage: the manager has added Dilnoza with her phone number and no password.
    await film.offCamera(async () => {
      const me = await getJson<{ branches: Array<{ id: string }> }>(s.ceo, "/auth/me");
      const added = await mutate<{ id: string }>(s.ceo, "post", "/staff", {
        fullName: who.name,
        phone: who.phone,
        gender: "FEMALE",
        roleCodes: ["TEACHER"],
        branchIds: [me.branches[0]!.id],
      }).catch(() => null);
      // She teaches a group together with the demo teacher, so her first screen has lessons on it.
      if (added?.id) {
        const group = await getJson<{
          teachers: Array<{ userId: string; role: string; shareType: string; shareValue: number }>;
        }>(s.ceo, `/groups/${s.base.teacherGroupId}`);
        await mutate(s.ceo, "patch", `/groups/${s.base.teacherGroupId}`, {
          teachers: [
            ...group.teachers.map(({ userId, role, shareType, shareValue }) => ({
              userId,
              role,
              shareType,
              shareValue,
            })),
            { userId: added.id, role: "CO_TEACHER", shareType: "PER_LESSON", shareValue: 40000 },
          ],
        }).catch(() => undefined);
      }
    });

    await install(s);
    await s.say("door", async () => {
      await film.click(page.getByText(s.label("mobile.doorStaff"), { exact: true }));
    });
    await s.say("phone", async () => {
      await film.type(page.getByTestId("phone"), who.phone);
      await film.click(page.getByTestId("get-code"));
      await page.getByTestId("phone-code-step").waitFor();
    });
    await s.say("bot", async () => {
      await film.show(page.getByTestId("open-bot"), 3);
      await shareNumber(page, who.phone, who.name);
    });
    await s.say("approve", async () => {
      await film.show(page.getByTestId("phone-code-step"), 2.5, page.getByTestId("code"));
    });
    // The button that leads on is pressed when the caption is over: the picture stays with what is said.
    await s.say("code", async () => {
      await film.type(page.getByTestId("code"), who.phone.slice(-6));
      return async () => {
        await film.click(page.getByTestId("confirm-code"));
        await page.getByTestId("new-password").waitFor();
      };
    });
    await s.say("password", async () => {
      await film.type(page.getByTestId("new-password"), who.password);
      await film.type(page.getByTestId("confirm-password"), who.password);
      return async () => {
        await film.click(page.getByTestId("save-password"));
        await page.getByTestId("nav-today").waitFor();
      };
    });
    await s.say(
      "inside",
      async () => {
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await film.show(page.getByTestId("nav-today"), 1.4);
        await film.hover(page.getByTestId("nav-groups"));
        await film.wait(0.5);
        await film.hover(page.getByTestId("nav-checking"));
        await film.wait(0.5);
        await film.hover(page.getByTestId("nav-more"));
      },
      1,
    );
    await s.say("again", async () => {
      await film.hover(page.getByTestId("nav-today"));
    });
  },
};

const student: AppScene = {
  id: "student",
  async run(s) {
    const { film, page } = s;
    await install(s);
    await s.say("door", async () => {
      await film.show(page.getByTestId("door"), 1.6);
      await film.type(page.getByTestId("phone"), STUDENT);
    });
    await s.say("phone", async () => {
      await film.click(page.getByTestId("get-code"));
      await page.getByTestId("phone-code-step").waitFor();
      await film.show(page.getByTestId("open-bot"), 2.4);
      await shareNumber(page, STUDENT, "Demo Student");
    });
    await s.say("approve", async () => {
      await film.show(page.getByTestId("phone-code-step"), 2.5, page.getByTestId("code"));
    });
    await s.say("code", async () => {
      await film.type(page.getByTestId("code"), STUDENT.slice(-6));
      return async () => {
        await film.click(page.getByTestId("confirm-code"));
        await page
          .getByTestId("password-later")
          .or(page.locator('[data-testid^="class-"]').first())
          .first()
          .waitFor();
      };
    });
    await s.say("password", async () => {
      const later = page.getByTestId("password-later");
      if ((await later.count()) === 0) return;
      await film.show(page.getByTestId("new-password"), 2);
      return async () => {
        await film.click(later);
        await page.locator('[data-testid^="class-"]').first().waitFor();
      };
    });
    const group = page.locator('[data-testid^="class-"]').first();
    await s.say("home", async () => {
      await film.show(group, 2.4);
    });
    await s.say("group", async () => {
      await film.click(group);
      await page.getByTestId("pages").waitFor();
      await film.show(page.getByTestId("pages"), 2.4);
    });
    await s.say("homework", async () => {
      await film.click(page.getByTestId("open-homework"));
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await film.wait(1.6);
    });
    await s.say("results", async () => {
      await film.offCamera(async () => {
        await page.goBack();
        await page.getByTestId("pages").waitFor();
      });
      await film.click(page.getByTestId("open-results"));
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await film.wait(1.6);
    });
    await s.say("money", async () => {
      await film.offCamera(async () => {
        await page.goBack();
        await page.getByTestId("pages").waitFor();
      });
      await film.show(page.getByTestId("money"), 2.4);
    });
  },
};

/** In the order of `APP_HELP_VIDEO_IDS`: the file of the first is `app/01-sign-in.mp4`. */
export const APP_SCENES: AppScene[] = [signIn, student];
