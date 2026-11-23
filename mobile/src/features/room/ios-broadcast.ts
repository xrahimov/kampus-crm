import { AppState } from "react-native";

import { broadcast } from "../../../modules/kampus-call";

/*
 * Starting a screen share on an iPhone or iPad (A-223). The app can only open
 * the system's sheet; the person presses "Start Broadcast" there, iOS counts
 * down three seconds and starts the app's extension, which says so. Nothing
 * tells the app that the sheet was closed without starting, so that is read
 * from the app coming back to the front with no word from the extension.
 */

/** How long the person gets to press "Start Broadcast" before the app stops waiting. */
export const BROADCAST_WAIT_MS = 30_000;
/**
 * How long after the sheet closes the extension may still report its start:
 * the three-second countdown goes on when the sheet is closed early.
 */
export const AFTER_SHEET_MS = 5_000;
/** The call engine reads a refusal that comes sooner than this as the device saying no. */
const CHOICE_MIN_MS = 1_000;

/** The person closed the sheet: named the way a browser names a closed picker. */
function closedByPerson(): { name: string; message: string } {
  return { name: "NotAllowedError", message: "" };
}

/**
 * Opens the system's sheet and waits until the extension has started.
 * Rejects like a closed browser picker when the person did not start it, and
 * with an ordinary error when the sheet could not be shown at all.
 */
export function startBroadcast(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const asked = Date.now();
    let settled = false;
    let away = false;
    let grace: ReturnType<typeof setTimeout> | null = null;

    const settle = (outcome: "started" | "closed" | "failed") => {
      if (settled) return;
      settled = true;
      stopHearing();
      appState.remove();
      clearTimeout(limit);
      if (grace) clearTimeout(grace);
      if (outcome === "started") resolve();
      else if (outcome === "failed") reject(new Error("The broadcast sheet could not be shown"));
      else {
        // Never sooner than a person can choose, or it would read as a refusal by the phone.
        const wait = Math.max(0, CHOICE_MIN_MS - (Date.now() - asked));
        if (wait === 0) reject(closedByPerson());
        else setTimeout(() => reject(closedByPerson()), wait);
      }
    };

    const stopHearing = broadcast.listen((state) => {
      if (state === "started") settle("started");
    });
    // The sheet belongs to the system: while it is up the app is not in front.
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        away = true;
        if (grace) clearTimeout(grace);
        grace = null;
      } else if (away && !grace) {
        grace = setTimeout(() => settle("closed"), AFTER_SHEET_MS);
      }
    });
    const limit = setTimeout(() => settle("closed"), BROADCAST_WAIT_MS);

    void broadcast.show().then((shown) => {
      if (!shown) settle("failed");
    });
  });
}
