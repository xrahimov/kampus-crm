"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

/**
 * An on/off choice kept in this browser (a folded menu, a note already read).
 * Off on the server and until the page has woken up, so the first paint is
 * the same on both sides.
 */
export function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) === "on";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = useCallback(
    (on: boolean) => {
      try {
        window.localStorage.setItem(key, on ? "on" : "off");
      } catch {
        // A private window keeps nothing; the choice then lasts until the page is left.
      }
      for (const notify of listeners) notify();
    },
    [key],
  );
  return [value, set];
}
