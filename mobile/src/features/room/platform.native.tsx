import type { StyleProp, ViewStyle } from "react-native";
import InCallManager from "react-native-incall-manager";
import { registerGlobals, RTCView } from "react-native-webrtc";

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

/** The loudspeaker and a screen that stays awake, from joining until leaving. */
export const callAudio = {
  start(): void {
    try {
      InCallManager.start({ media: "video" });
      InCallManager.setKeepScreenOn(true);
    } catch {
      // No audio routing on this device: the call still works on the default output.
    }
  },
  stop(): void {
    try {
      InCallManager.setKeepScreenOn(false);
      InCallManager.stop();
    } catch {
      // Nothing was started.
    }
  },
};
