import { requireOptionalNativeModule } from "expo";

/*
 * The part of a lesson that only native code can do (A-208). On Android a call
 * that should survive the person opening another app (to show it while sharing
 * the screen, or to answer a message) has to run as a foreground service with
 * a visible notice; without it the phone silences the microphone and soon
 * stops the app. iOS keeps a call alive by itself (the "audio" background
 * mode), and a browser needs nothing, so this part exists on Android only.
 */
interface KampusCallNative {
  /** Starts the lesson's service and shows its notice. False when the phone refused. */
  start(title: string, text: string, channel: string): boolean;
  /** Stops the service and removes the notice. */
  stop(): boolean;
}

const native = requireOptionalNativeModule<KampusCallNative>("KampusCall");

export const callService = {
  start(words: { title: string; text: string; channel: string }): boolean {
    try {
      return native?.start(words.title, words.text, words.channel) ?? false;
    } catch {
      return false;
    }
  },
  stop(): void {
    try {
      native?.stop();
    } catch {
      // Nothing was running.
    }
  },
};

/*
 * Sharing the screen of an iPhone or iPad (A-223). iOS captures the screen in
 * an extension that ships inside the app; the native side of this module opens
 * the system's sheet that starts it and passes on what the extension says.
 * The module exists on iOS only.
 */
export type BroadcastState = "started" | "stopped";

interface KampusBroadcastNative {
  /** Opens the system's "Screen Broadcast" sheet with Kampus chosen. */
  showPicker(): Promise<boolean>;
  addListener(
    event: "onBroadcast",
    listener: (event: { state: BroadcastState }) => void,
  ): { remove(): void };
}

const broadcastNative = requireOptionalNativeModule<KampusBroadcastNative>("KampusBroadcast");

export const broadcast = {
  /** True in a build that has the extension (an iPhone or iPad). */
  available: broadcastNative != null,
  /** Opens the system's sheet. False when the phone could not show it. */
  async show(): Promise<boolean> {
    try {
      return (await broadcastNative?.showPicker()) ?? false;
    } catch {
      return false;
    }
  },
  /** Hears the extension start and stop; the answer ends the listening. */
  listen(listener: (state: BroadcastState) => void): () => void {
    const heard = broadcastNative?.addListener("onBroadcast", (event) => listener(event.state));
    return () => heard?.remove();
  },
};
