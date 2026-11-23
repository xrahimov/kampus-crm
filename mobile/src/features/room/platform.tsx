import { createElement, useCallback } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

/*
 * The web build's side of `platform.native.tsx` (A-207): a browser already has
 * WebRTC, so nothing is registered, and a picture is a <video> element.
 */

export function prepareCalls(): void {
  // A browser has RTCPeerConnection and navigator.mediaDevices already.
}

export const CALLS_AVAILABLE: boolean =
  typeof navigator !== "undefined" &&
  typeof RTCPeerConnection !== "undefined" &&
  Boolean(navigator.mediaDevices);

/** Gives an element its stream and starts it; a browser may hold playing back until a tap. */
function useStreamRef<T extends HTMLMediaElement>(stream: MediaStream) {
  return useCallback(
    (element: T | null) => {
      if (!element) return;
      if (element.srcObject !== stream) element.srcObject = stream;
      void element.play().catch(() => undefined);
    },
    [stream],
  );
}

/** Draws the picture of a stream in a <video> element. */
export function StreamView({
  stream,
  mirror = false,
  fit = "cover",
  muted = true,
  style,
  testID,
}: {
  stream: MediaStream;
  mirror?: boolean;
  fit?: "cover" | "contain";
  /** Pictures are silent; everyone's sound plays through `RemoteAudio`. */
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const attach = useStreamRef<HTMLVideoElement>(stream);
  return createElement("video", {
    ref: attach,
    autoPlay: true,
    playsInline: true,
    muted,
    "data-testid": testID,
    style: {
      ...(StyleSheet.flatten(style) as object),
      objectFit: fit,
      transform: mirror ? "scaleX(-1)" : undefined,
      backgroundColor: "transparent",
    },
  });
}

/** Someone's sound, apart from their picture (a student hidden by focus mode is still heard). */
export function RemoteAudio({ stream }: { stream: MediaStream }) {
  const attach = useStreamRef<HTMLAudioElement>(stream);
  return createElement("audio", { ref: attach, autoPlay: true, style: { display: "none" } });
}

/** A browser picks its own output and keeps the tab awake while a call runs. */
export const callAudio = {
  start(): void {},
  stop(): void {},
};
