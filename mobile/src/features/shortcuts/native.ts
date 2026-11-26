import * as AppIntents from "expo-app-intents";

import type { Locale } from "@/lib/i18n";

import { shortcutNote } from "../../../modules/kampus-call";
import type { ShortcutSnapshot } from "./snapshot";

/*
 * The note of `snapshot.ts`, handed to the phone (A-273, A-274).
 *
 * iPhone and iPad: three small lists in the store of `expo-app-intents`, which
 * the Swift code in `app-intents/` reads when Siri asks: who is signed in
 * ("who"), the lessons ("lesson") and the homework ("homework"). A list's
 * entries need an id and a title; everything else travels as text.
 * Android: one JSON text in the app's settings store (modules/kampus-call).
 * A browser has neither, and every call here does nothing.
 */

type Entity = Parameters<typeof AppIntents.setEntityCatalogAsync>[1][number];

function entities(note: ShortcutSnapshot | null, locale: Locale): Record<string, Entity[]> {
  if (!note) return { who: [], lesson: [], homework: [] };
  return {
    who: [
      {
        id: note.kind,
        title: note.kind,
        metadata: {
          savedAt: String(note.savedAt),
          locale,
          ...(note.toCheck == null ? {} : { toCheck: String(note.toCheck) }),
        },
      },
    ],
    lesson: note.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      ...(lesson.place ? { subtitle: lesson.place } : {}),
      metadata: {
        startsAt: String(lesson.startsAt),
        endsAt: String(lesson.endsAt),
        live: lesson.live ? "1" : "0",
      },
    })),
    homework: note.homework.map((task) => ({
      id: task.id,
      title: task.title,
      ...(task.due ? { metadata: { due: task.due } } : {}),
    })),
  };
}

/** Writes the note, or wipes it with `null` when nobody is signed in. */
export async function saveNote(note: ShortcutSnapshot | null, locale: Locale): Promise<void> {
  shortcutNote.save(note ? JSON.stringify({ ...note, locale }) : null);
  if (!AppIntents.isAvailable()) return;
  const lists = entities(note, locale);
  // "who" goes last when writing and first when wiping, so Siri never reads
  // one person's lessons under another's name.
  const order = note ? ["lesson", "homework", "who"] : ["who", "lesson", "homework"];
  for (const kind of order) {
    try {
      await AppIntents.setEntityCatalogAsync(kind, lists[kind] ?? []);
    } catch {
      // A refused list keeps its last good contents; the next load writes again.
    }
  }
}

/** The names Swift registered for donations (`AppIntentsSetup.swift`). */
export type Donation = "nextLesson" | "startLesson" | "homework";

/**
 * Tells the iPhone that the person just did this by hand, so that it can offer
 * the shortcut on the lock screen and in Spotlight at the hours they usually do.
 */
export function donate(name: Donation): void {
  if (!AppIntents.isAvailable()) return;
  AppIntents.donateIntentAsync(name).catch(() => undefined);
}

/** Forgets what was learned about this person's habits (sign-out). */
export function forgetDonations(): void {
  if (!AppIntents.isAvailable()) return;
  for (const intent of ["nextLesson", "startLesson", "homework"] satisfies Donation[]) {
    AppIntents.deleteDonationsAsync({ intent }).catch(() => undefined);
  }
}
