/** What the scenes of the tutorial videos share: the demo sign-ins and the `Shoot` they are handed. */
import type { Browser, Page } from "@playwright/test";

import type { Base } from "../help-screenshots";

import type { Film } from "./film";
import type { Locale, VideoId } from "./words";

export const BASE = process.env.APP_URL ?? "http://localhost:3000";
export const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";
export const CEO = process.env.SEED_ADMIN_PHONE ?? "+998900000001";
export const TEACHER = "+998900000004";

/** What a scene works with: the camera, the page in front of it, and a way backstage. */
export interface Shoot {
  locale: Locale;
  film: Film;
  browser: Browser;
  /** The page being filmed. */
  page: Page;
  /** Signed in as the demo CEO and never filmed: for reading and preparing demo rows. */
  ceo: Page;
  /** The demo teacher's group, one of its students' links, and the other rows `prepare` made. */
  base: Base;
  /** A label of the app in this language, by its key in `messages/<locale>.json`. */
  label(key: string, values?: Record<string, string>): string;
  /** One step: its caption under the picture while `work` is done on screen. */
  say(step: string, work?: () => Promise<void>, extra?: number): Promise<void>;
  /** Opens a page of the app off camera; the video goes on with it loaded. */
  go(pathname: string, page?: Page): Promise<void>;
  /** Signs in off camera with the demo password. */
  signIn(phone: string, page?: Page, password?: string): Promise<void>;
  url(pathname: string): string;
}

export interface Scene {
  id: VideoId;
  run(shoot: Shoot): Promise<void>;
}
