"use client";

import {
  Circle,
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  SendHorizontal,
  Square,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { cn } from "@/lib/utils";

import { CHAT_MAX_LENGTH, type CallEngine, type RemotePeer } from "./call-engine";
import { CallRecorder, recordingMimeType, uploadRecording } from "./recorder";
import { VideoTile } from "./video-tile";

const SELF = "self";
type Panel = "people" | "chat" | null;

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
  const [panel, setPanel] = useState<Panel>(null);
  // The teacher's "mute" shows a notice for a few seconds (keyed by when it came).
  const [noticeShownFor, setNoticeShownFor] = useState<number | null>(null);
  const canShare =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const [recorder, setRecorder] = useState<CallRecorder | null>(null);
  const [saving, setSaving] = useState(false);
  const [recordNotice, setRecordNotice] = useState<"saved" | "failed" | null>(null);
  const canRecord = engine.self.role === "HOST" && recordingMimeType() !== null;

  // Leaving the page while recording would lose it.
  useEffect(() => {
    if (!recorder && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recorder, saving]);

  useEffect(() => {
    if (!recordNotice) return;
    const timer = setTimeout(() => setRecordNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [recordNotice]);

  /** Stops the recording, if one runs, and files it under the lesson before anything else. */
  const finishRecording = async (): Promise<void> => {
    if (!recorder) return;
    setRecorder(null);
    setSaving(true);
    try {
      const result = await recorder.stop();
      await uploadRecording(engine.self.roomId, result);
      setRecordNotice("saved");
    } catch {
      setRecordNotice("failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleRecording = () => {
    if (recorder) {
      void finishRecording();
      return;
    }
    try {
      const next = new CallRecorder(engine);
      next.start();
      setRecorder(next);
    } catch {
      setRecordNotice("failed");
    }
  };

  useEffect(() => {
    const leave = () => engine.leave();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [engine]);

  const peers = engine.peers();
  const self = engine.self;
  const media = engine.media;
  const isHost = self.role === "HOST";
  const mutedBy = engine.mutedBy;

  // Chat lines count as read while the panel is open.
  useEffect(() => {
    if (panel === "chat") engine.markChatRead();
  }, [engine, panel, engine.unread]);

  const mutedNotice = mutedBy && noticeShownFor !== mutedBy.at ? mutedBy.name : null;
  useEffect(() => {
    if (!mutedBy) return;
    const timer = setTimeout(() => setNoticeShownFor(mutedBy.at), 6000);
    return () => clearTimeout(timer);
  }, [mutedBy]);

  const togglePanel = (next: Exclude<Panel, null>) =>
    setPanel((cur) => (cur === next ? null : next));
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
          hand={media.hand}
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
        hand={Boolean(p.media?.hand)}
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
        <div className="flex items-center gap-1">
          <HeaderButton
            active={panel === "people"}
            onClick={() => togglePanel("people")}
            testId="toggle-people"
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">{t("people")}</span>
            {peers.some((p) => p.media?.hand) && (
              <Hand className="size-3.5 text-amber-400" aria-label={t("handRaised")} />
            )}
          </HeaderButton>
          <HeaderButton
            active={panel === "chat"}
            onClick={() => togglePanel("chat")}
            testId="toggle-chat"
          >
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">{t("chat")}</span>
            {engine.unread > 0 && (
              <span
                className="grid min-w-5 place-items-center rounded-full bg-sidebar-active px-1 text-xs font-semibold text-white"
                data-testid="chat-unread"
              >
                {engine.unread}
              </span>
            )}
          </HeaderButton>
        </div>
      </header>

      {(recorder || saving || recordNotice) && (
        <p
          className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-md bg-sidebar-muted px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="recording-notice"
        >
          {recorder ? (
            <>
              <Circle className="size-3 animate-pulse fill-red-500 text-red-500" aria-hidden />
              {t("recording")}
            </>
          ) : saving ? (
            t("savingRecording")
          ) : recordNotice === "saved" ? (
            t("recordingSaved")
          ) : (
            t("recordingFailed")
          )}
        </p>
      )}
      {mutedNotice && (
        <p
          className="mx-4 mb-2 rounded-md bg-sidebar-muted px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="muted-notice"
        >
          {t("mutedBy", { name: mutedNotice })}
        </p>
      )}

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
        {panel && (
          <SidePanel title={t(panel)} onClose={() => setPanel(null)} testId={`${panel}-panel`}>
            {panel === "people" ? (
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center justify-between gap-2 text-white">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {media.hand && <Hand className="size-3.5 shrink-0 text-amber-400" />}
                    <span className="truncate">{t("you", { name: self.displayName })}</span>
                  </span>
                  <RoleMark role={self.role} />
                </li>
                {peers.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {p.media?.hand && <Hand className="size-3.5 shrink-0 text-amber-400" />}
                      {p.media && !p.media.audio && <MicOff className="size-3.5 shrink-0" />}
                      <span className="truncate">{p.displayName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <RoleMark role={p.role} />
                      {isHost && p.role !== "HOST" && (p.media?.audio ?? true) && (
                        <button
                          type="button"
                          onClick={() => engine.mutePeers([p.id])}
                          aria-label={t("mutePerson", { name: p.displayName })}
                          title={t("mutePerson", { name: p.displayName })}
                          data-testid="mute-peer"
                          className="grid size-7 place-items-center rounded-md hover:bg-sidebar hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-active"
                        >
                          <MicOff className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ChatPanel engine={engine} />
            )}
          </SidePanel>
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
        <ControlButton
          active={!media.hand}
          onClick={() => engine.setHand(!media.hand)}
          label={media.hand ? t("lowerHand") : t("raiseHand")}
          testId="toggle-hand"
          className={cn(!media.hand || "!bg-amber-400 !text-sidebar hover:!bg-amber-300")}
        >
          <Hand />
        </ControlButton>
        {isHost && peers.length > 0 && (
          <ControlButton
            active
            disabled={peers.every((p) => p.media && !p.media.audio)}
            onClick={() => engine.mutePeers()}
            label={t("muteAll")}
            testId="mute-all"
          >
            <MicOff />
          </ControlButton>
        )}
        {canRecord && (
          <ControlButton
            active={!recorder}
            disabled={saving}
            onClick={toggleRecording}
            label={recorder ? t("stopRecording") : t("record")}
            testId="toggle-record"
            className={cn(recorder && "!bg-red-600 !text-white hover:!bg-red-500")}
          >
            {recorder ? <Square /> : <Circle />}
          </ControlButton>
        )}
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
          onClick={() => void finishRecording().then(onLeave)}
          disabled={saving}
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
          onConfirm={async () => {
            await finishRecording();
            await onEndForAll();
          }}
        />
      )}
    </div>
  );
}

function HeaderButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      data-testid={testId}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-muted focus-visible:outline-2 focus-visible:outline-sidebar-active",
        active && "bg-sidebar-muted text-white",
      )}
    >
      {children}
    </button>
  );
}

/** People or chat: a column beside the video on wide screens, the whole screen on phones. */
function SidePanel({
  title,
  onClose,
  testId,
  children,
}: {
  title: string;
  onClose: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      className="fixed inset-0 z-10 flex flex-col bg-sidebar p-3 md:static md:inset-auto md:z-auto md:w-72 md:shrink-0 md:rounded-lg md:bg-sidebar-muted"
      aria-label={title}
      data-testid={testId}
    >
      <div className="mb-2 flex items-center justify-between md:hidden">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={title}
          className="grid size-8 place-items-center rounded-md hover:bg-sidebar-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </aside>
  );
}

function ChatPanel({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.room");
  const format = useFormatter();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const count = engine.chat.length;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    engine.sendChat(draft);
    setDraft("");
  };

  return (
    <>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {count === 0 && <p className="py-6 text-center text-xs opacity-70">{t("chatEmpty")}</p>}
        {engine.chat.map((m) => (
          <div
            key={m.id}
            data-testid="chat-message"
            className={cn(
              "max-w-[90%] rounded-lg px-2.5 py-1.5",
              m.from === null ? "ml-auto bg-sidebar-active/30 text-white" : "bg-sidebar/60",
            )}
          >
            <p className="flex items-baseline justify-between gap-2 text-xs opacity-70">
              <span className="truncate">{m.name}</span>
              <time dateTime={m.at.toISOString()}>
                {format.dateTime(m.at, { timeStyle: "short" })}
              </time>
            </p>
            <p className="break-words whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="mt-2 flex items-end gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              engine.sendChat(draft);
              setDraft("");
            }
          }}
          rows={1}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={t("chatPlaceholder")}
          aria-label={t("chat")}
          data-testid="chat-input"
          className="min-h-9 flex-1 resize-none rounded-md border border-sidebar-muted bg-sidebar px-2.5 py-1.5 text-sm text-white placeholder:text-sidebar-foreground/60 focus-visible:outline-2 focus-visible:outline-sidebar-active"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label={t("send")}
          data-testid="chat-send"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-active text-white hover:bg-sidebar-active/80 disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </>
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
