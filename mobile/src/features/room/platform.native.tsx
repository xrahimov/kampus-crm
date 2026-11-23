import {
  Dimensions,
  PermissionsAndroid,
  PixelRatio,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import InCallManager from "react-native-incall-manager";
import { mediaDevices, registerGlobals, RTCView } from "react-native-webrtc";

import { SCREEN_MAX_WIDTH } from "@kampus/lib/video/call-engine";

import { callService } from "../../../modules/kampus-call";

/*
 * What a lesson room needs from the phone (A-207): WebRTC itself, a view that
 * draws a camera picture, and the loudspeaker. The call engine is the site's
 * own (`@kampus/lib/video/call-engine`); it expects a browser's names
 * (RTCPeerConnection, MediaStream, navigator.mediaDevices), which
 * `registerGlobals` puts in place here.
 *
 * The web build of the app gets `platform.tsx` instead, where the browser has
 * all of this already.
 */

let registered = false;

/** Makes WebRTC available under the names a browser uses. Safe to call again. */
export function prepareCalls(): void {
  if (registered) return;
  registerGlobals();
  registered = true;
}

/** Whether this device can run a lesson room at all. */
export const CALLS_AVAILABLE = true;

/** A phone's stream knows the address its picture is drawn from. */
interface NativeStream {
  toURL(): string;
}

/** Draws the picture of a stream: a camera, or a shared screen. */
export function StreamView({
  stream,
  mirror = false,
  fit = "cover",
  style,
  testID,
}: {
  stream: MediaStream;
  /** Your own front camera is shown like a mirror. */
  mirror?: boolean;
  /** "contain" keeps the whole picture (a shared screen); "cover" fills the tile. */
  fit?: "cover" | "contain";
  /** The web build has no sound from a picture unless told; a phone plays it by itself. */
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // The native view reads the stream's tracks when it is given the address, so a
  // picture that arrives later (or a switched camera) needs a fresh view: the key.
  const track = stream.getVideoTracks()[0];
  return (
    <RTCView
      key={track?.id ?? "none"}
      streamURL={(stream as unknown as NativeStream).toURL()}
      mirror={mirror}
      objectFit={fit}
      style={style}
      testID={testID}
    />
  );
}

/** A phone plays everyone's sound by itself; only the web build needs an element for it. */
export function RemoteAudio(_props: { stream: MediaStream }) {
  return null;
}

/** What the phone's notice says while a lesson runs with another app in front. */
export interface CallWords {
  title: string;
  text: string;
  channel: string;
}

/**
 * The loudspeaker and a screen that stays awake, from joining until leaving. On
 * Android the lesson also runs as a foreground service (A-208): without it the
 * phone silences the microphone as soon as another app is in front.
 */
export const callAudio = {
  start(words: CallWords): void {
    try {
      InCallManager.start({ media: "video" });
      InCallManager.setKeepScreenOn(true);
    } catch {
      // No audio routing on this device: the call still works on the default output.
    }
    if (Platform.OS === "android") {
      callService.start(words);
      // The notice is how the person comes back to the lesson; Android 13 asks before
      // showing any. A "no" changes nothing else: the service runs either way.
      if (Number(Platform.Version) >= 33) {
        void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
          () => undefined,
        );
      }
    }
  },
  stop(): void {
    try {
      InCallManager.setKeepScreenOn(false);
      InCallManager.stop();
    } catch {
      // Nothing was started.
    }
    if (Platform.OS === "android") callService.stop();
  },
};

/** The names a browser gives a capture that did not start; the phone gives them as the message. */
const CAPTURE_ERRORS = new Set([
  "NotAllowedError",
  "AbortError",
  "NotReadableError",
  "NotFoundError",
  "SecurityError",
]);

/** A refusal from the phone, named the way the call engine sorts a browser's. */
export function captureError(error: unknown): { name: string; message: string } {
  const message =
    typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  const name =
    typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (CAPTURE_ERRORS.has(name)) return { name, message };
  if (CAPTURE_ERRORS.has(message)) return { name: message, message: "" };
  return { name: "Error", message: message || String(error) };
}

/** How much to shrink a screen whose longer side has this many pixels, so no more than Full HD goes out. */
export function captureScale(longestSidePx: number): number {
  if (!(longestSidePx > SCREEN_MAX_WIDTH)) return 1;
  return Math.round((SCREEN_MAX_WIDTH / longestSidePx) * 100) / 100;
}

/**
 * Sharing this device's screen (A-208). Android asks the person once per share
 * ("Start recording or casting?") and then captures whatever is in front, also
 * other apps. iPhones and iPads come next: they need an app extension.
 */
export const screenShare = {
  available: Platform.OS === "android",
  async open(): Promise<MediaStream> {
    const screen = Dimensions.get("screen");
    const longest = Math.max(screen.width, screen.height) * PixelRatio.get();
    try {
      const stream = await mediaDevices.getDisplayMedia({
        android: { resolutionScale: captureScale(longest) },
      });
      return stream as unknown as MediaStream;
    } catch (error) {
      throw captureError(error);
    }
  },
};
