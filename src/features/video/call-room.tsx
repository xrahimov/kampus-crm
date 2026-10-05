"use client";

import {
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Square,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { cn } from "@/lib/utils";

import type { CallEngine, RemotePeer } from "./call-engine";
import { VideoTile } from "./video-tile";

const SELF = "self";

/**
 * The call screen: a stage for the teacher (or whoever shares a screen, or the
 * pinned person) and a strip of everyone else; a grid when nobody leads.
 */
export function CallRoom({
  engine,
  onLeave,
  onEndForAll,
}: {
  engine: CallEngine;
  onLeave: () => void;
  /** Present when this person may end the call for everyone. */
  onEndForAll?: () => Promise<void>;
}) {
  const t = useTranslations("video.room");
  useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);
  const [pinned, setPinned] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const canShare =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

  useEffect(() => {
    const leave = () => engine.leave();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [engine]);

  const peers = engine.peers();
  const self = engine.self;
  const media = engine.media;
  const hasAudio = engine.localStream.getAudioTracks().length > 0;
  const hasCamera = engine.localStream.getVideoTracks().length > 0 || media.screen;

  const sharer = peers.find((p) => p.media?.screen)?.id ?? (media.screen ? SELF : null);
  const host = peers.find((p) => p.role === "HOST")?.id ?? null;
  const pinnedId =
    pinned && (pinned === SELF || peers.some((p) => p.id === pinned)) ? pinned : null;
  // Students watch the teacher; teachers and guests see everyone unless someone leads.
  const stageId = pinnedId ?? sharer ?? (self.role === "STUDENT" ? host : null) ?? null;

  const statusText = (p: RemotePeer): string | null => {
    if (p.connection === "connected") return null;
    if (p.connection === "failed") return t("failed");
    return t("connecting");
  };

  const tile = (id: string, big: boolean) => {
    const togglePin = () => setPinned((cur) => (cur === id ? null : id));
    if (id === SELF) {
      return (
        <VideoTile
          key={SELF}
          testId="tile-self"
          stream={engine.localStream}
          name={self.displayName}
          isSelf
          audioOn={media.audio}
          videoOn={media.video || media.screen}
          screen={media.screen}
          pinned={pinnedId === SELF}
          onPin={togglePin}
          className={big ? "size-full" : "aspect-video"}
        />
      );
    }
    const p = peers.find((x) => x.id === id);
    if (!p) return null;
    return (
      <VideoTile
        key={p.id}
        testId="tile-peer"
        stream={p.stream}
        name={p.displayName}
        audioOn={p.media?.audio ?? true}
        videoOn={(p.media?.video ?? true) || Boolean(p.media?.screen)}
        screen={Boolean(p.media?.screen)}
        status={statusText(p)}
        pinned={pinnedId === p.id}
        onPin={togglePin}
        className={big ? "size-full" : "aspect-video"}
      />
    );
  };

  const everyone = [SELF, ...peers.map((p) => p.id)];
  const others = everyone.filter((id) => id !== stageId);
  const gridCols =
    everyone.length <= 1
      ? "grid-cols-1"
      : everyone.length <= 4
        ? "grid-cols-1 sm:grid-cols-2"
        : everyone.length <= 9
          ? "grid-cols-2 lg:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-sidebar text-sidebar-foreground"
      data-testid="call-room"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-white">{self.groupName}</h1>
          <p className="text-xs" data-testid="call-count">
            {engine.status === "connecting"
              ? t("joining")
              : t("inCall", { count: peers.length + 1 })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPeople((v) => !v)}
          aria-expanded={showPeople}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-muted focus-visible:outline-2 focus-visible:outline-sidebar-active"
        >
          <Users className="size-4" /> {t("people")}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-4">
        <main className="min-h-0 min-w-0 flex-1">
          {stageId ? (
            <div className="flex h-full flex-col gap-3 lg:flex-row">
              <div className="min-h-0 flex-1">{tile(stageId, true)}</div>
              {others.length > 0 && (
                <div className="flex shrink-0 gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
                  {others.map((id) => (
                    <div key={id} className="w-40 shrink-0 lg:w-full">
                      {tile(id, false)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "grid h-full content-center gap-3 overflow-y-auto",
                gridCols,
                everyone.length === 1 && "mx-auto max-w-3xl",
              )}
            >
              {everyone.map((id) => tile(id, false))}
            </div>
          )}
        </main>
        {showPeople && (
          <aside
            className="hidden w-64 shrink-0 overflow-y-auto rounded-lg bg-sidebar-muted p-3 md:block"
            aria-label={t("people")}
          >
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center justify-between gap-2 text-white">
                <span className="truncate">{t("you", { name: self.displayName })}</span>
                <RoleMark role={self.role} />
              </li>
              {peers.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {p.media && !p.media.audio && <MicOff className="size-3.5 shrink-0" />}
                    <span className="truncate">{p.displayName}</span>
                  </span>
                  <RoleMark role={p.role} />
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-sidebar-muted px-3 py-3 sm:gap-3">
        <ControlButton
          active={media.audio}
          disabled={!hasAudio}
          onClick={() => engine.setAudio(!media.audio)}
          label={media.audio ? t("mute") : t("unmute")}
          testId="toggle-mic"
        >
          {media.audio ? <Mic /> : <MicOff />}
        </ControlButton>
        <ControlButton
          active={media.video}
          disabled={!hasCamera || media.screen}
          onClick={() => engine.setVideo(!media.video)}
          label={media.video ? t("cameraOff") : t("cameraOn")}
          testId="toggle-camera"
        >
          {media.video ? <Video /> : <VideoOff />}
        </ControlButton>
        {canShare && (
          <ControlButton
            active={!media.screen}
            onClick={() => void (media.screen ? engine.stopScreen() : engine.shareScreen())}
            label={media.screen ? t("stopSharing") : t("shareScreen")}
            className="hidden sm:inline-flex"
          >
            {media.screen ? <MonitorX /> : <MonitorUp />}
          </ControlButton>
        )}
        <button
          type="button"
          onClick={onLeave}
          data-testid="leave-call"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-destructive px-5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-active [&_svg]:size-4"
        >
          <PhoneOff /> {t("leave")}
        </button>
        {onEndForAll && (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            data-testid="end-call"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-sidebar-muted px-4 text-sm hover:bg-sidebar-muted focus-visible:outline-2 focus-visible:outline-sidebar-active [&_svg]:size-4"
          >
            <Square /> {t("endForAll")}
          </button>
        )}
      </footer>

      {onEndForAll && (
        <ConfirmDialog
          open={confirmEnd}
          onOpenChange={setConfirmEnd}
          title={t("endTitle")}
          description={t("endText")}
          confirmLabel={t("endForAll")}
          onConfirm={onEndForAll}
        />
      )}
    </div>
  );
}

function RoleMark({ role }: { role: RemotePeer["role"] }) {
  const t = useTranslations("video.roles");
  if (role === "STUDENT") return null;
  return <span className="shrink-0 text-xs text-sidebar-active">{t(role)}</span>;
}

function ControlButton({
  active,
  disabled,
  onClick,
  label,
  children,
  className,
  testId,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-active disabled:opacity-40 [&_svg]:size-5",
        active
          ? "bg-sidebar-muted text-white hover:bg-sidebar-muted/70"
          : "bg-white text-sidebar hover:bg-white/90",
        className,
      )}
    >
      {children}
    </button>
  );
}
