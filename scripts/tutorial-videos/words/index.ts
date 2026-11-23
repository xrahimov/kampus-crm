import { en } from "./en";
import { ru } from "./ru";
import { uz } from "./uz";

export type Locale = "en" | "ru" | "uz";
export type VideoId = keyof (typeof en)["videos"];
/** The videos recorded in the phone app (A-229). */
export type AppVideoId = keyof (typeof en)["appVideos"];

/** Every language carries every video and every step: a missing caption is a type error. */
export type Words = {
  series: string;
  videos: {
    [K in VideoId]: {
      title: string;
      note: string;
      steps: Record<keyof (typeof en)["videos"][K]["steps"], string>;
    };
  };
  appSeries: string;
  appVideos: {
    [K in AppVideoId]: {
      title: string;
      note: string;
      steps: Record<keyof (typeof en)["appVideos"][K]["steps"], string>;
    };
  };
};

export const WORDS: Record<Locale, Words> = { en, ru, uz };
