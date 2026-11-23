import { requireOptionalNativeModule } from "expo";

/*
 * The part of a lesson that only native code can do (A-208). On Android a call
 * that should survive the person opening another app (to show it while sharing
 * the screen, or to answer a message) has to run as a foreground service with
 * a visible notice; without it the phone silences the microphone and soon
 * stops the app. iOS keeps a call alive by itself (the "audio" background
 * mode), and a browser needs nothing, so the module exists on Android only.
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
