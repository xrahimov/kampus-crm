import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { centreToday } from "@/lib/days";

/*
 * Whether this person has looked at today's summary on this phone (A-253).
 * The site opens the summary by itself once a day; a phone app that opens a
 * window over what was just tapped is in the way, so the app only marks the
 * button on Home until the summary has been looked at. Kept per person, as
 * the site keeps it per person in the browser.
 */
const seenKey = (userId: string) => `kampus.summary.seen.${userId}`;

const listeners = new Set<() => void>();

/** Notes that the person has today's summary in front of them. */
export async function markSummarySeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(seenKey(userId), centreToday());
  } catch {
    // Without storage the mark simply shows again tomorrow or after a restart.
  }
  for (const listener of listeners) listener();
}

/** True until today's summary (by the centre's day) was opened on this phone. */
export function useSummaryUnseen(userId: string): boolean {
  const [unseen, setUnseen] = useState(false);
  const read = useCallback(() => {
    AsyncStorage.getItem(seenKey(userId))
      .then((day) => setUnseen(day !== centreToday()))
      .catch(() => setUnseen(false));
  }, [userId]);
  useEffect(() => {
    read();
    listeners.add(read);
    return () => {
      listeners.delete(read);
    };
  }, [read]);
  return unseen;
}
