"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PeerDto } from "@/server/services/video/video.service";

import { openLocalMedia } from "./call-engine";
import { VideoTile } from "./video-tile";

/**
 * Before joining: a camera preview with microphone and camera switches. The
 * stream opened here is handed to the call, so the browser asks only once.
 */
export function Lobby({
  role,
  name,
  ready,
  busy,
  error,
  joinLabel,
  waitingText,
  onJoin,
}: {
  role: PeerDto["role"];
  name: string;
  /** False while there is no call to join yet (the button stays disabled). */
  ready: boolean;
  busy: boolean;
  error: string | null;
  joinLabel: string;
  waitingText?: string;
  onJoin: (stream: MediaStream) => void;
}) {
  const t = useTranslations("video.lobby");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [denied, setDenied] = useState(false);
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let opened: MediaStream | null = null;
    void openLocalMedia(role, { audio: true, video: true }).then((r) => {
      opened = r.stream;
      if (cancelled) {
        for (const tr of r.stream.getTracks()) tr.stop();
        return;
      }
      setStream(r.stream);
      setDenied(r.denied);
    });
    return () => {
      cancelled = true;
      // The call owns the tracks once joined; only an abandoned lobby stops them.
      const tracks = (opened as MediaStream | null)?.getTracks() ?? [];
      if (!tracks.some((tr) => handedOver.has(tr))) for (const tr of tracks) tr.stop();
    };
  }, [role]);

  function toggle(kind: "audio" | "video") {
    if (!stream) return;
    const next = kind === "audio" ? !audio : !video;
    const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
    for (const tr of tracks) tr.enabled = next;
    if (kind === "audio") setAudio(next);
    else setVideo(next);
  }

  const hasAudio = Boolean(stream?.getAudioTracks().length);
  const hasVideo = Boolean(stream?.getVideoTracks().length);

  return (
    <div className="space-y-4">
      <VideoTile
        stream={stream}
        name={name}
        isSelf
        audioOn={audio && hasAudio}
        videoOn={video && hasVideo}
        status={stream ? null : t("opening")}
        className="aspect-video w-full"
        testId="lobby-preview"
      />
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant={audio && hasAudio ? "outline" : "secondary"}
          size="icon"
          onClick={() => toggle("audio")}
          disabled={!hasAudio}
          aria-label={audio ? t("micOff") : t("micOn")}
          aria-pressed={!audio}
        >
          {audio && hasAudio ? <Mic /> : <MicOff />}
        </Button>
        <Button
          type="button"
          variant={video && hasVideo ? "outline" : "secondary"}
          size="icon"
          onClick={() => toggle("video")}
          disabled={!hasVideo}
          aria-label={video ? t("cameraOff") : t("cameraOn")}
          aria-pressed={!video}
        >
          {video && hasVideo ? <Video /> : <VideoOff />}
        </Button>
      </div>
      {denied && stream && <Alert>{hasAudio || hasVideo ? t("partial") : t("denied")}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
      {!ready && waitingText && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ring opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-ring" />
          </span>
          {waitingText}
        </p>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={!ready || busy || !stream}
        onClick={() => {
          if (!stream) return;
          for (const tr of stream.getTracks()) handedOver.add(tr);
          onJoin(stream);
        }}
        data-testid="join-call"
      >
        {busy ? t("joining") : joinLabel}
      </Button>
    </div>
  );
}

/** Tracks given to a call; the lobby must not stop them when it unmounts. */
const handedOver = new WeakSet<MediaStreamTrack>();
