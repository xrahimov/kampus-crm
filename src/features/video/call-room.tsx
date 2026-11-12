"use client";

import {
  BookOpen,
  ChartBar,
  Circle,
  Focus,
  Hand,
  LayoutGrid,
  UserX,
  MessageSquare,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  MonitorX,
  PenLine,
  PhoneOff,
  Presentation,
  SendHorizontal,
  SmilePlus,
  Square,
  Star,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { PACE_REACTIONS, REACTIONS, type Reaction } from "@/lib/validation/video";
import { cn } from "@/lib/utils";
import { canAnnotate } from "@/lib/video-material";

import { CHAT_MAX_LENGTH, type CallEngine, type RemotePeer } from "./call-engine";
import { BreakoutPanel, breakoutCountdown } from "./breakout-panel";
import { LessonPanel } from "./lesson-panel";
import { MaterialStage } from "./material-stage";
import { PollPanel } from "./poll-panel";
import { CallRecorder, recordingMimeType, uploadBoard, uploadRecording } from "./recorder";
import { VideoTile } from "./video-tile";
import { Whiteboard } from "./whiteboard";

const SELF = "self";
type Panel = "people" | "chat" | "poll" | "lesson" | "breakout" | null;

/** How each reaction looks on a picture. */
export const REACTION_EMOJI: Record<Reaction, string> = {
  like: "👍",
  clap: "👏",
  heart: "❤️",
  laugh: "😂",
  wow: "😮",
  slower: "🐢",
  faster: "🐇",
};

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
  const [lowerShownFor, setLowerShownFor] = useState<number | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const canShare =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
  // Where the browser cannot share a screen (iPads and phones, A-182), the button explains.
  const [shareHelp, setShareHelp] = useState(false);
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
  const isStudent = self.role === "STUDENT";
  const mutedBy = engine.mutedBy;
  const loweredBy = engine.loweredBy;
  const stage = engine.currentStage;
  const breakout = engine.breakout;
  const notice = engine.notice;
  const reactions = engine.activeReactions();
  // The breakout countdown ticks once a second while rooms are open.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (breakout.rooms === 0 || !breakout.endsAt) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [breakout.rooms, breakout.endsAt]);
  const countdown = breakout.rooms > 0 ? breakoutCountdown(breakout.endsAt, clock) : null;
  const pace = isStudent ? null : engine.paceTally();

  // Chat lines count as read while the panel is open; so does a poll.
  useEffect(() => {
    if (panel === "chat") engine.markChatRead();
  }, [engine, panel, engine.unread]);
  const pollKey = engine.poll ? `${engine.poll.id}:${engine.poll.open}` : null;
  useEffect(() => {
    if (panel === "poll") engine.markPollSeen();
  }, [engine, panel, pollKey]);

  const mutedNotice = mutedBy && noticeShownFor !== mutedBy.at ? mutedBy.name : null;
  useEffect(() => {
    if (!mutedBy) return;
    const timer = setTimeout(() => setNoticeShownFor(mutedBy.at), 6000);
    return () => clearTimeout(timer);
  }, [mutedBy]);

  const loweredNotice = loweredBy && lowerShownFor !== loweredBy.at ? loweredBy.name : null;
  useEffect(() => {
    if (!loweredBy) return;
    const timer = setTimeout(() => setLowerShownFor(loweredBy.at), 6000);
    return () => clearTimeout(timer);
  }, [loweredBy]);

  const togglePanel = (next: Exclude<Panel, null>) =>
    setPanel((cur) => (cur === next ? null : next));
  const hasAudio = engine.localStream.getAudioTracks().length > 0;
  const hasCamera = engine.localStream.getVideoTracks().length > 0 || media.screen;

  const sharer = peers.find((p) => p.media?.screen)?.id ?? (media.screen ? SELF : null);
  const host = peers.find((p) => p.role === "HOST")?.id ?? null;
  // The teacher's spotlight, as a tile id here (the teacher may spotlight themselves).
  const spotlightId =
    stage.spotlight === self.participantId
      ? SELF
      : peers.some((p) => p.id === stage.spotlight)
        ? stage.spotlight
        : null;
  // Focus mode: students see only the teacher, the spotlight, a shared screen and themselves.
  const focusHides = (p: RemotePeer) =>
    isStudent && stage.focus && p.role === "STUDENT" && p.id !== spotlightId && p.id !== sharer;
  const hidden = new Set(peers.filter(focusHides).map((p) => p.id));
  const pinnedId =
    pinned && (pinned === SELF || peers.some((p) => p.id === pinned && !hidden.has(p.id)))
      ? pinned
      : null;
  // Students watch the teacher; teachers and guests see everyone unless someone leads.
  const stageId = pinnedId ?? spotlightId ?? sharer ?? (isStudent ? host : null) ?? null;
  // The whiteboard takes the stage from everyone (A-155), and so does a material the teacher
  // shows (A-183). With both on, the pen draws over the material's page; where a material
  // cannot be drawn on (a video, a link), the whiteboard covers it until it is closed.
  const BOARD = "board";
  const MATERIAL = "material";
  const shown = stage.material;
  const penOverMaterial = shown !== null && canAnnotate(shown.view);
  const stageKey =
    shown && (!stage.board || penOverMaterial) ? MATERIAL : stage.board ? BOARD : stageId;

  // Raised hands in the order they went up; this browser's own hand takes its place too.
  const handQueue = [
    ...peers
      .filter((p) => p.media?.hand)
      .map((p) => ({ id: p.id, name: p.displayName, at: p.handRaisedAt ?? p.joinedAt })),
    ...(media.hand
      ? [{ id: SELF, name: self.displayName, at: engine.handRaisedAt ?? new Date().toISOString() }]
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const handPlace = (id: string) => handQueue.findIndex((h) => h.id === id) + 1;

  const statusText = (p: RemotePeer): string | null => {
    if (p.connection === "connected") return null;
    if (p.connection === "failed") return t("failed");
    return t("connecting");
  };

  const reactionOf = (from: string | null) => {
    const r = reactions.get(from);
    return r ? { key: r.seq, emoji: REACTION_EMOJI[r.reaction] } : undefined;
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
          handPlace={media.hand ? handPlace(SELF) : undefined}
          reaction={reactionOf(null)}
          spotlight={spotlightId === SELF}
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
        handPlace={p.media?.hand ? handPlace(p.id) : undefined}
        reaction={reactionOf(p.id)}
        spotlight={spotlightId === p.id}
        status={statusText(p)}
        pinned={pinnedId === p.id}
        onPin={togglePin}
        className={big ? "size-full" : "aspect-video"}
      />
    );
  };

  const everyone = [SELF, ...peers.filter((p) => !hidden.has(p.id)).map((p) => p.id)];
  const others = everyone.filter((id) => id !== stageKey);
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
      <header className="flex items-center justify-between gap-3 px-4 py-3 short:py-1">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-white">{self.groupName}</h1>
          <p className="text-xs" data-testid="call-count">
            {engine.status === "connecting"
              ? t("joining")
              : t("inCall", { count: peers.length + 1 })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {pace && pace.slower + pace.faster > 0 && (
            <span
              className="flex items-center gap-2 rounded-md bg-sidebar-muted px-2.5 py-1 text-xs text-white"
              title={t("paceTitle")}
              data-testid="pace-tally"
            >
              {pace.slower > 0 && (
                <span>
                  {REACTION_EMOJI.slower} {t("paceSlower", { count: pace.slower })}
                </span>
              )}
              {pace.faster > 0 && (
                <span>
                  {REACTION_EMOJI.faster} {t("paceFaster", { count: pace.faster })}
                </span>
              )}
            </span>
          )}
          <HeaderButton
            active={panel === "people"}
            onClick={() => togglePanel("people")}
            testId="toggle-people"
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">{t("people")}</span>
            {handQueue.length > 0 && (
              <span
                className="flex items-center gap-0.5 text-xs text-amber-400"
                aria-label={t("handRaised")}
                data-testid="hand-count"
              >
                <Hand className="size-3.5" />
                {handQueue.length}
              </span>
            )}
          </HeaderButton>
          {isHost && (
            <HeaderButton
              active={panel === "breakout"}
              onClick={() => togglePanel("breakout")}
              testId="toggle-breakout"
            >
              <LayoutGrid className="size-4" />
              <span className="hidden sm:inline">{t("breakout")}</span>
              {breakout.rooms > 0 && (
                <span className="size-2 rounded-full bg-amber-400" aria-hidden />
              )}
            </HeaderButton>
          )}
          <HeaderButton
            active={panel === "lesson"}
            onClick={() => togglePanel("lesson")}
            testId="toggle-lesson"
          >
            <BookOpen className="size-4" />
            <span className="hidden sm:inline">{t("lesson")}</span>
          </HeaderButton>
          {(isHost || engine.poll) && (
            <HeaderButton
              active={panel === "poll"}
              onClick={() => togglePanel("poll")}
              testId="toggle-poll"
            >
              <ChartBar className="size-4" />
              <span className="hidden sm:inline">{t("poll")}</span>
              {engine.pollUnseen && panel !== "poll" && (
                <span
                  className="size-2 rounded-full bg-amber-400"
                  aria-label={t("pollNew")}
                  data-testid="poll-unseen"
                />
              )}
            </HeaderButton>
          )}
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

      {engine.noShow && engine.self.role === "HOST" && (
        <p
          className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-md bg-amber-600/90 px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="no-show-bar"
        >
          <UserX className="size-4 shrink-0" aria-hidden />
          {t("noShow")}
        </p>
      )}

      {breakout.rooms > 0 && (
        <p
          className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-md bg-sidebar-muted px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="breakout-notice-bar"
        >
          <LayoutGrid className="size-4 shrink-0" aria-hidden />
          {breakout.mine === null
            ? t("breakoutMain", { rooms: breakout.rooms })
            : t("breakoutIn", { number: breakout.mine })}
          {countdown && (
            <span className="tabular-nums opacity-80" data-testid="breakout-countdown">
              {countdown}
            </span>
          )}
        </p>
      )}
      {notice && (
        <button
          type="button"
          onClick={() => engine.dismissNotice()}
          className="mx-4 mb-2 rounded-md bg-amber-400 px-3 py-2 text-center text-sm font-medium text-sidebar hover:bg-amber-300"
          data-testid="host-notice"
        >
          {t("noticeFrom", { name: notice.name })} {notice.text}
        </button>
      )}
      {isStudent && engine.poll?.open && engine.pollUnseen && panel !== "poll" && (
        <button
          type="button"
          onClick={() => setPanel("poll")}
          className="mx-4 mb-2 rounded-md bg-amber-400 px-3 py-2 text-center text-sm font-medium text-sidebar hover:bg-amber-300"
          data-testid="poll-notice"
        >
          {t("pollAsk", { question: engine.poll.question })}
        </button>
      )}
      {loweredNotice && (
        <p
          className="mx-4 mb-2 rounded-md bg-sidebar-muted px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="lowered-notice"
        >
          {t("loweredBy", { name: loweredNotice })}
        </p>
      )}
      {stage.focus && (
        <p
          className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-md bg-sidebar-muted px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="focus-notice"
        >
          <Focus className="size-4 shrink-0" aria-hidden />
          {isStudent ? t("focusStudent") : t("focusTeacher")}
        </p>
      )}

      {shareHelp && (
        <div
          className="mx-4 mb-2 flex flex-wrap items-center justify-center gap-2 rounded-md bg-sidebar-muted px-3 py-2 text-center text-sm text-white"
          role="status"
          data-testid="share-unavailable"
        >
          <span>{t("shareUnavailable")}</span>
          {isHost && (
            <NoticeAction
              onClick={() => {
                engine.setStage({ board: true });
                setShareHelp(false);
              }}
              testId="share-use-board"
            >
              {t("shareUseBoard")}
            </NoticeAction>
          )}
          <NoticeAction
            onClick={() => {
              setPanel("lesson");
              setShareHelp(false);
            }}
            testId="share-use-lesson"
          >
            {t("shareUseLesson")}
          </NoticeAction>
          {engine.canSwitchCamera && (
            <NoticeAction
              onClick={() => {
                void engine.switchCamera();
                setShareHelp(false);
              }}
              testId="share-use-camera"
            >
              {t("switchCamera")}
            </NoticeAction>
          )}
          <button
            type="button"
            onClick={() => setShareHelp(false)}
            aria-label={t("dismiss")}
            className="grid size-8 place-items-center rounded-md hover:bg-sidebar focus-visible:outline-2 focus-visible:outline-sidebar-active"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Students hidden by focus mode are still heard. */}
      {peers
        .filter((p) => hidden.has(p.id))
        .map((p) => (
          <PeerAudio key={p.id} stream={p.stream} />
        ))}

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-4">
        <main className="min-h-0 min-w-0 flex-1">
          {stageKey ? (
            <div className="flex h-full flex-col gap-3 lg:flex-row short:flex-row">
              <div className="min-h-0 flex-1">
                {stageKey === MATERIAL && shown ? (
                  <MaterialStage key={shown.id} engine={engine} material={shown} />
                ) : stageKey === BOARD ? (
                  <Whiteboard
                    engine={engine}
                    onSave={isHost ? (png) => uploadBoard(self.roomId, png) : undefined}
                  />
                ) : (
                  tile(stageKey, true)
                )}
              </div>
              {others.length > 0 && (
                <div className="flex shrink-0 gap-3 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto short:w-32 short:flex-col short:gap-2 short:overflow-x-visible short:overflow-y-auto">
                  {others.map((id) => (
                    <div key={id} className="w-40 shrink-0 lg:w-full short:w-full">
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
              <div className="space-y-4 text-sm">
                {handQueue.length > 0 && (
                  <section data-testid="hand-queue">
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-400 uppercase">
                      <Hand className="size-3.5" /> {t("handQueue")}
                    </h3>
                    <ol className="space-y-1">
                      {handQueue.map((h, i) => (
                        <li
                          key={h.id}
                          className="flex items-center justify-between gap-2"
                          data-testid="hand-queue-item"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-semibold text-sidebar">
                              {i + 1}
                            </span>
                            <span className={cn("truncate", h.id === SELF && "text-white")}>
                              {h.id === SELF ? t("you", { name: h.name }) : h.name}
                            </span>
                          </span>
                          {isHost && h.id !== SELF && (
                            <PanelButton
                              onClick={() => engine.lowerHand(h.id)}
                              label={t("lowerHandFor", { name: h.name })}
                              testId="lower-hand"
                            >
                              <Hand className="size-3.5" />
                            </PanelButton>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <ul className="space-y-1.5">
                  <li className="flex items-center justify-between gap-2 text-white">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {media.hand && <Hand className="size-3.5 shrink-0 text-amber-400" />}
                      <span className="truncate">{t("you", { name: self.displayName })}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <RoleMark role={self.role} />
                      {isHost && (
                        <SpotlightButton
                          on={spotlightId === SELF}
                          name={self.displayName}
                          onClick={() =>
                            engine.setStage({
                              spotlight: spotlightId === SELF ? null : self.participantId,
                            })
                          }
                        />
                      )}
                    </span>
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
                        {isHost && (
                          <SpotlightButton
                            on={spotlightId === p.id}
                            name={p.displayName}
                            onClick={() =>
                              engine.setStage({ spotlight: spotlightId === p.id ? null : p.id })
                            }
                          />
                        )}
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
              </div>
            ) : panel === "poll" ? (
              <PollPanel engine={engine} />
            ) : panel === "lesson" ? (
              <LessonPanel
                engine={engine}
                onShown={() => {
                  // On a phone the panel covers the stage: get out of the way.
                  if (window.matchMedia("(max-width: 767px)").matches) setPanel(null);
                }}
              />
            ) : panel === "breakout" ? (
              <BreakoutPanel engine={engine} />
            ) : (
              <ChatPanel engine={engine} />
            )}
          </SidePanel>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-sidebar-muted px-3 py-3 sm:gap-3 short:py-1.5">
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
        <div className="relative">
          <ControlButton
            active={!reactionsOpen}
            onClick={() => setReactionsOpen((v) => !v)}
            label={t("reactions")}
            testId="toggle-reactions"
          >
            <SmilePlus />
          </ControlButton>
          {reactionsOpen && (
            <div
              className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 gap-1 rounded-full bg-sidebar-muted p-1.5 shadow-lg"
              role="toolbar"
              aria-label={t("reactions")}
              data-testid="reactions"
            >
              {REACTIONS.filter((r) => isStudent || !PACE_REACTIONS.includes(r)).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    engine.react(r);
                    setReactionsOpen(false);
                  }}
                  aria-label={t(`reaction.${r}`)}
                  title={t(`reaction.${r}`)}
                  data-testid={`react-${r}`}
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-xl hover:bg-sidebar focus-visible:outline-2 focus-visible:outline-sidebar-active",
                    PACE_REACTIONS.includes(r) && "ml-1 border-l border-sidebar pl-1",
                  )}
                >
                  <span aria-hidden>{REACTION_EMOJI[r]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {isHost && (
          <ControlButton
            active={!shown}
            onClick={() => (shown ? engine.hideMaterial() : setPanel("lesson"))}
            label={shown ? t("stopShowing") : t("showFile")}
            testId="toggle-present"
          >
            <Presentation />
          </ControlButton>
        )}
        {isHost && (
          <ControlButton
            active={!stage.board}
            onClick={() => engine.setStage({ board: !stage.board })}
            label={
              penOverMaterial
                ? stage.board
                  ? t("penOff")
                  : t("penOn")
                : stage.board
                  ? t("boardOff")
                  : t("boardOn")
            }
            testId="toggle-board"
          >
            <PenLine />
          </ControlButton>
        )}
        {isHost && (
          <ControlButton
            active={!stage.focus}
            onClick={() => engine.setStage({ focus: !stage.focus })}
            label={stage.focus ? t("focusOff") : t("focusOn")}
            testId="toggle-focus"
          >
            <Focus />
          </ControlButton>
        )}
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
        {engine.canSwitchCamera && (
          <ControlButton
            active
            disabled={!media.video}
            onClick={() => void engine.switchCamera()}
            label={t("switchCamera")}
            testId="switch-camera"
          >
            <SwitchCamera />
          </ControlButton>
        )}
        {canShare ? (
          <ControlButton
            active={!media.screen}
            onClick={() => void (media.screen ? engine.stopScreen() : engine.shareScreen())}
            label={media.screen ? t("stopSharing") : t("shareScreen")}
            testId="toggle-share"
          >
            {media.screen ? <MonitorX /> : <MonitorUp />}
          </ControlButton>
        ) : (
          <ControlButton
            active={!shareHelp}
            onClick={() => setShareHelp((v) => !v)}
            label={t("shareUnavailableButton")}
            testId="share-unavailable-button"
          >
            <MonitorOff />
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
            aria-label={t("endForAll")}
            title={t("endForAll")}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-sidebar-muted px-3 text-sm hover:bg-sidebar-muted focus-visible:outline-2 focus-visible:outline-sidebar-active lg:px-4 [&_svg]:size-4"
          >
            <Square /> <span className="hidden lg:inline">{t("endForAll")}</span>
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
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-muted focus-visible:outline-2 focus-visible:outline-sidebar-active pointer-coarse:min-h-10 pointer-coarse:px-3.5",
        active && "bg-sidebar-muted text-white",
      )}
    >
      {children}
    </button>
  );
}

/** A small action inside a notice bar. */
function NoticeAction({
  onClick,
  testId,
  children,
}: {
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="rounded-md bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-sidebar-active"
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

/** Plays a person's sound when their picture is not shown (focus mode). */
function PeerAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  const audioId = stream.getAudioTracks()[0]?.id ?? null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream, audioId]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

function PanelButton({
  onClick,
  label,
  testId,
  pressed,
  children,
}: {
  onClick: () => void;
  label: string;
  testId: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      data-testid={testId}
      className={cn(
        "grid size-7 place-items-center rounded-md hover:bg-sidebar hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-active",
        pressed && "text-amber-400",
      )}
    >
      {children}
    </button>
  );
}

function SpotlightButton({
  on,
  name,
  onClick,
}: {
  on: boolean;
  name: string;
  onClick: () => void;
}) {
  const t = useTranslations("video.room");
  return (
    <PanelButton
      onClick={onClick}
      pressed={on}
      label={on ? t("unspotlight", { name }) : t("spotlight", { name })}
      testId="spotlight"
    >
      <Star className={cn("size-3.5", on && "fill-current")} />
    </PanelButton>
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
