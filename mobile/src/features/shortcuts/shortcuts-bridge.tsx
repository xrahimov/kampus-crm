import { skipToken, useQuery } from "@tanstack/react-query";
import * as AppIntents from "expo-app-intents";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useCheckingQueue, useToday } from "@/api/hooks";
import type { StudentHome } from "@/api/types";
import { useLocaleChoice } from "@/lib/i18n";
import { useSession } from "@/lib/session";

import { forgetDonations, saveNote } from "./native";
import { staffSnapshot, studentSnapshot, type ShortcutSnapshot } from "./snapshot";
import { isShortcut } from "./targets";

/*
 * Keeps the phone's shortcuts in step with the app (A-273). It draws nothing.
 *
 * - Whenever the day's lessons or the student's home are loaded, the note for
 *   Siri and Gemini is written again; at sign-out it is wiped.
 * - When Siri runs "Start my lesson" the app opens, and the wish it left is
 *   turned into the screen `/shortcut/<wish>`, which finds the lesson.
 *   (Android's shortcuts arrive as links, `kampus://shortcut/<wish>`, and need
 *   no help: the router opens the same screen.)
 */

/** A wish older than this was not followed by the app opening: it is dropped, not obeyed late. */
const WISH_LIFETIME = 2 * 60_000;

export function ShortcutsBridge() {
  const { state } = useSession();
  const { locale } = useLocaleChoice();
  const router = useRouter();
  const status = state.status;

  // A teacher's day is asked for here, once, because not everyone lands on the Today tab.
  const today = useToday(null, status === "staff");
  const queue = useCheckingQueue(status === "staff");
  // A student's home is only read: the home screen loads it and keeps it fresh.
  const home = useQuery<StudentHome>({ queryKey: ["student", "home"], queryFn: skipToken });

  const note: ShortcutSnapshot | null =
    status === "staff" && today.data
      ? staffSnapshot(today.data, queue.data?.total ?? null, today.dataUpdatedAt)
      : status === "student" && home.data
        ? studentSnapshot(home.data, home.dataUpdatedAt)
        : null;
  const text = note ? JSON.stringify(note) : null;

  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (status === "staff" || status === "student") {
      wasSignedIn.current = true;
      if (text) void saveNote(JSON.parse(text) as ShortcutSnapshot, locale);
      return;
    }
    if (status === "signedOut") {
      void saveNote(null, locale);
      if (wasSignedIn.current) forgetDonations();
      wasSignedIn.current = false;
    }
  }, [status, text, locale]);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  AppIntents.useAppIntents(async (pending) => {
    for (const wish of pending) {
      await AppIntents.removePendingInvocationAsync(wish.id).catch(() => undefined);
      const what = wish.params.what;
      const fresh = Date.now() - wish.createdAt < WISH_LIFETIME;
      const signedIn = statusRef.current === "staff" || statusRef.current === "student";
      if (wish.name !== "open" || !isShortcut(what) || !fresh || !signedIn) continue;
      router.push({ pathname: "/shortcut/[what]", params: { what } });
    }
  });

  return null;
}
