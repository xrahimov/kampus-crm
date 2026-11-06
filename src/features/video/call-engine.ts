import {
  BOARD_MAX_STROKES,
  boardOpSchema,
  NOTICE_MAX_LENGTH,
  PACE_REACTIONS,
  REACTIONS,
  type BoardOp,
  type BoardStroke,
  type Reaction,
  type SignalKind,
  type VideoSyncInput,
} from "@/lib/validation/video";
import type { PollDto } from "@/server/services/video/video-polls.service";
import type {
  BreakoutDto,
  JoinDto,
  PeerDto,
  StageDto,
  SyncDto,
} from "@/server/services/video/video.service";

/*
 * The browser side of a video lesson: one RTCPeerConnection per other
 * participant (full mesh), with offers, answers and ICE candidates relayed
 * through `/video/peers/:id/sync`, which this engine polls.
 *
 * To avoid offer collisions only one side of each pair ever offers: the peer
 * whose id sorts first. The other side asks for an ICE restart with a
 * "restart" message when its connection fails.
 */

export interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
  /** Raised hand: "I want to say something". */
  hand: boolean;
}

/** One line of the in-call chat; it lives only as long as the tab does. */
export interface ChatMessage {
  id: number;
  /** null when this browser wrote it. */
  from: string | null;
  name: string;
  text: string;
  at: Date;
}

export const CHAT_MAX_LENGTH = 500;

/** How long a reaction floats over a picture. */
export const REACTION_SHOW_MS = 4000;
/** How long a student's "slower" / "faster" counts in the teacher's tally. */
export const PACE_WINDOW_MS = 60_000;

/** A reaction shown on someone's picture; `from` is null for this browser's own. */
export interface ShownReaction {
  seq: number;
  from: string | null;
  reaction: Reaction;
  at: number;
}

export interface RemotePeer {
  id: string;
  displayName: string;
  role: PeerDto["role"];
  joinedAt: string;
  media: MediaState | null;
  handRaisedAt: string | null;
  stream: MediaStream;
  connection: RTCPeerConnectionState;
}

export type CallStatus = "connecting" | "live" | "ended" | "gone" | "error";

interface PeerLink {
  info: PeerDto;
  pc: RTCPeerConnection;
  stream: MediaStream;
  offerer: boolean;
  pending: RTCIceCandidateInit[];
  restartTimer: ReturnType<typeof setTimeout> | null;
}

interface OutgoingSignal {
  to: string;
  kind: SignalKind;
  payload: unknown;
}

const POLL_FAST_MS = 400;
const POLL_MS = 1200;

/** Upload budget per outgoing video stream, by how many people receive it. */
export function videoBitrate(role: PeerDto["role"], receivers: number): number {
  if (role === "HOST") return receivers <= 4 ? 900_000 : 600_000;
  return Math.max(120_000, Math.min(400_000, Math.floor(1_500_000 / Math.max(1, receivers))));
}

export class CallEngine {
  readonly self: JoinDto;
  status: CallStatus = "connecting";
  private links = new Map<string, PeerLink>();
  private outbox: OutgoingSignal[] = [];
  private cursor = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private failures = 0;
  private local: MediaStream;
  private camera: MediaStreamTrack | null;
  private screen: MediaStreamTrack | null = null;
  media: MediaState;
  chat: ChatMessage[] = [];
  /** Chat lines received while the panel was closed. */
  unread = 0;
  /** Set when the teacher switched this microphone off; the room shows a notice. */
  mutedBy: { name: string; at: number } | null = null;
  /** Set when the teacher lowered this hand; the room shows a notice. */
  loweredBy: { name: string; at: number } | null = null;
  /** The teacher's spotlight and focus mode, as the server last reported them. */
  stage: StageDto = { spotlight: null, focus: false, board: false };
  /** The teacher's own change, sent on every poll until the server reports it back. */
  private stageDraft: StageDto | null = null;
  /** When this browser's hand went up (server time), for its place in the queue. */
  handRaisedAt: string | null = null;
  /** Recent reactions, newest last. */
  reactions: ShownReaction[] = [];
  /** Latest "slower" / "faster" per student, for the teacher. */
  private pace = new Map<string, { reaction: Reaction; at: number }>();
  /** Whiteboard strokes in drawing order (A-155); `by` is null for this browser's own. */
  board: Array<BoardStroke & { by: string | null }> = [];
  /** Bumped on every board change so the canvas redraws. */
  boardVersion = 0;
  /** Whether students may draw; the teacher decides. */
  boardStudentsMayDraw = false;
  /** Peers that still need the board history (the teacher sends it after they appear). */
  private boardNewcomers = new Set<string>();
  /** The open poll, else the last closed one (A-153). */
  poll: PollDto | null = null;
  /** Breakout rooms as the server last reported them (A-156). */
  breakout: BreakoutDto = { rooms: 0, endsAt: null, mine: null, everyone: null };
  /** Set once the 1:1 student was marked absent for not joining (A-167); the teacher sees it. */
  noShow: string | null = null;
  /** The teacher's breakout change waiting for the next sync. */
  private breakoutDraft: NonNullable<VideoSyncInput["breakout"]> | null = null;
  /** The teacher's latest line to everyone, shown as a banner (A-156). */
  notice: { text: string; name: string; at: number } | null = null;
  /** Poll ids this browser has already been shown, for the "new poll" badge. */
  private seenPolls = new Set<string>();
  /** A poll action waiting for the next sync. */
  private pollAction: NonNullable<VideoSyncInput["poll"]> | null = null;
  private chatSeq = 0;
  private reactionSeq = 0;

  private listeners = new Set<() => void>();
  /** Bumped on every change; the snapshot for useSyncExternalStore. */
  version = 0;

  constructor(self: JoinDto, local: MediaStream) {
    this.self = self;
    this.local = local;
    this.camera = local.getVideoTracks()[0] ?? null;
    this.media = {
      audio: local.getAudioTracks().some((t) => t.enabled),
      video: Boolean(this.camera?.enabled),
      screen: false,
      hand: false,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private onChange(): void {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  get localStream(): MediaStream {
    return this.local;
  }

  peers(): RemotePeer[] {
    return [...this.links.values()]
      .map((l) => ({
        id: l.info.id,
        displayName: l.info.displayName,
        role: l.info.role,
        joinedAt: l.info.joinedAt,
        media: l.info.media ? { hand: false, ...l.info.media } : null,
        handRaisedAt: l.info.handRaisedAt ?? null,
        stream: l.stream,
        connection: l.pc.connectionState,
      }))
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  }

  start(): void {
    void this.tick();
  }

  /* ----- local controls ------------------------------------------------------------------- */

  setAudio(on: boolean): void {
    for (const t of this.local.getAudioTracks()) t.enabled = on;
    this.media = { ...this.media, audio: on && this.local.getAudioTracks().length > 0 };
    this.changed(true);
  }

  setVideo(on: boolean): void {
    if (this.camera) this.camera.enabled = on;
    this.media = { ...this.media, video: on && Boolean(this.camera) };
    this.changed(true);
  }

  setHand(on: boolean): void {
    this.media = { ...this.media, hand: on };
    this.changed(true);
  }

  /** Posts a chat line to everyone in the room (new arrivals do not see earlier lines). */
  sendChat(text: string): void {
    const clean = text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!clean) return;
    const at = new Date();
    this.chat.push({
      id: ++this.chatSeq,
      from: null,
      name: this.self.displayName,
      text: clean,
      at,
    });
    for (const id of this.links.keys())
      this.send(id, "chat", { text: clean, at: at.toISOString() });
    this.onChange();
  }

  markChatRead(): void {
    if (this.unread === 0) return;
    this.unread = 0;
    this.onChange();
  }

  /** Teacher only: asks one person, or everyone, to switch their microphone off. */
  mutePeers(ids: string[] = [...this.links.keys()]): void {
    if (this.self.role !== "HOST") return;
    for (const id of ids) if (this.links.has(id)) this.send(id, "mute", null);
  }

  /** Teacher only: asks one person to lower their raised hand. */
  lowerHand(id: string): void {
    if (this.self.role !== "HOST" || !this.links.has(id)) return;
    this.send(id, "lower", null);
  }

  /** Teacher only: puts one person (or nobody) on everyone's stage and switches focus mode. */
  setStage(change: Partial<StageDto>): void {
    if (this.self.role !== "HOST") return;
    this.stageDraft = { ...(this.stageDraft ?? this.stage), ...change };
    this.changed(true);
  }

  /** The stage as this browser should show it: the teacher's draft wins until confirmed. */
  get currentStage(): StageDto {
    return this.stageDraft ?? this.stage;
  }

  /**
   * Sends a reaction. Everyone sees ordinary ones on the sender's picture;
   * "slower" and "faster" go only to the teacher and staff.
   */
  react(reaction: Reaction): void {
    if (!REACTIONS.includes(reaction)) return;
    const pace = PACE_REACTIONS.includes(reaction);
    for (const link of this.links.values()) {
      if (pace && link.info.role === "STUDENT") continue;
      this.send(link.info.id, "react", { reaction });
    }
    this.pushReaction(null, reaction);
  }

  /* ----- breakout rooms (A-156) ----------------------------------------------------------- */

  /** Teacher only: opens `rooms` sub-rooms for `minutes` (null = until closed) and seats people. */
  startBreakout(
    rooms: number,
    minutes: number | null,
    assign: Array<{ id: string; room: number | null }>,
  ): void {
    if (this.self.role !== "HOST") return;
    this.breakoutDraft = { rooms, minutes, assign };
    this.changed(true);
  }

  /** Teacher only: moves one person (possibly themselves) to a sub-room or back to the main room. */
  moveToRoom(id: string, room: number | null): void {
    if (this.self.role !== "HOST" || this.breakout.rooms === 0) return;
    const draft = this.breakoutDraft ?? { rooms: this.breakout.rooms, assign: [] };
    this.breakoutDraft = {
      ...draft,
      assign: [...draft.assign.filter((a) => a.id !== id), { id, room }],
    };
    this.changed(true);
  }

  /** Teacher only: closes the sub-rooms; everyone is back together. */
  endBreakout(): void {
    if (this.self.role !== "HOST") return;
    this.breakoutDraft = { rooms: 0, assign: [] };
    this.changed(true);
  }

  /** Teacher only: a line everyone sees, whichever room they are in. */
  sendNotice(text: string): void {
    if (this.self.role !== "HOST") return;
    const clean = text.trim().slice(0, NOTICE_MAX_LENGTH);
    if (!clean) return;
    // `to` is ignored for notices: the server fans them out to everyone online.
    this.send(this.self.participantId, "notice", { text: clean, name: this.self.displayName });
    this.notice = { text: clean, name: this.self.displayName, at: Date.now() };
    this.onChange();
  }

  dismissNotice(): void {
    if (!this.notice) return;
    this.notice = null;
    this.onChange();
  }

  /* ----- whiteboard (A-155) --------------------------------------------------------------- */

  /** Whether this browser may draw right now. */
  get canDraw(): boolean {
    return this.self.role !== "STUDENT" || this.boardStudentsMayDraw;
  }

  /** Adds a finished stroke of this browser and sends it to everyone. */
  drawStroke(stroke: BoardStroke): void {
    if (!this.canDraw) return;
    this.applyBoard({ op: "stroke", stroke }, null);
    this.broadcastBoard({ op: "stroke", stroke });
  }

  /** Removes this browser's latest stroke everywhere. */
  undoStroke(): void {
    const mine = [...this.board].reverse().find((s) => s.by === null);
    if (!mine) return;
    this.applyBoard({ op: "undo", id: mine.id }, null);
    this.broadcastBoard({ op: "undo", id: mine.id });
  }

  /** Teacher only: wipes the board for everyone. */
  clearBoard(): void {
    if (this.self.role !== "HOST") return;
    this.applyBoard({ op: "clear" }, null);
    this.broadcastBoard({ op: "clear" });
  }

  /** Teacher only: lets students draw, or stops them. */
  setStudentsMayDraw(on: boolean): void {
    if (this.self.role !== "HOST") return;
    this.boardStudentsMayDraw = on;
    this.broadcastBoard({ op: "allow", students: on });
    this.onChange();
  }

  private broadcastBoard(op: BoardOp): void {
    for (const id of this.links.keys()) this.send(id, "board", op);
  }

  private applyBoard(op: BoardOp, from: string | null): void {
    if (op.op === "stroke") {
      this.board = [...this.board, { ...op.stroke, by: from }].slice(-BOARD_MAX_STROKES);
    } else if (op.op === "undo") {
      // Only the stroke's author (or the teacher) may take it back.
      const target = this.board.find((s) => s.id === op.id);
      if (!target) return;
      const fromHost = from !== null && this.links.get(from)?.info.role === "HOST";
      if (target.by !== from && !fromHost && from !== null) return;
      this.board = this.board.filter((s) => s.id !== op.id);
    } else if (op.op === "clear") {
      this.board = [];
    } else if (op.op === "sync") {
      const known = new Set(this.board.map((s) => s.id));
      const fresh = op.strokes.filter((s) => !known.has(s.id)).map((s) => ({ ...s, by: from }));
      this.board = [...this.board, ...fresh].slice(-BOARD_MAX_STROKES);
    } else if (op.op === "allow") {
      this.boardStudentsMayDraw = op.students;
    }
    this.boardVersion += 1;
    this.onChange();
  }

  /** The teacher's browser gives newcomers the board so far, in batches under the signal size. */
  private sendBoardHistory(to: string): void {
    if (this.self.role !== "HOST") return;
    const strokes = this.board.map(({ by: _by, ...s }) => s);
    const batches: BoardStroke[][] = [];
    let batch: BoardStroke[] = [];
    let size = 0;
    for (const s of strokes) {
      const weight = 20 + s.points.length * 14;
      if (batch.length >= 50 || size + weight > 15_000) {
        batches.push(batch);
        batch = [];
        size = 0;
      }
      batch.push(s);
      size += weight;
    }
    batches.push(batch);
    batches.forEach((b, i) =>
      this.send(to, "board", { op: "sync", strokes: b, done: i === batches.length - 1 }),
    );
    this.send(to, "board", { op: "allow", students: this.boardStudentsMayDraw });
  }

  /** Teacher only: asks a question with 2-6 answers; any open poll closes. */
  openPoll(question: string, options: string[]): void {
    if (this.self.role !== "HOST") return;
    this.pollAction = { action: "open", question, options };
    this.changed(true);
  }

  /** Teacher only: closes the open poll, showing the results to everyone. */
  closePoll(): void {
    if (this.self.role !== "HOST" || !this.poll?.open) return;
    this.pollAction = { action: "close", pollId: this.poll.id };
    this.changed(true);
  }

  /** Student: answers the open poll (again to change the answer). */
  votePoll(option: number): void {
    if (this.self.role !== "STUDENT" || !this.poll?.open) return;
    this.pollAction = { action: "vote", pollId: this.poll.id, option };
    this.poll = { ...this.poll, myVote: option };
    this.changed(true);
  }

  /** Whether a poll arrived that this browser has not shown yet. */
  get pollUnseen(): boolean {
    return Boolean(this.poll && !this.seenPolls.has(`${this.poll.id}:${this.poll.open}`));
  }

  markPollSeen(): void {
    if (!this.poll || !this.pollUnseen) return;
    this.seenPolls.add(`${this.poll.id}:${this.poll.open}`);
    this.onChange();
  }

  /** Whether a poll action is still on its way to the server. */
  get pollPending(): boolean {
    return this.pollAction !== null;
  }

  /** Students' latest "slower" / "faster" in the last minute, for the teacher's tally. */
  paceTally(now = Date.now()): { slower: number; faster: number } {
    const tally = { slower: 0, faster: 0 };
    for (const [from, v] of this.pace) {
      if (now - v.at > PACE_WINDOW_MS || !this.links.has(from)) continue;
      if (v.reaction === "slower") tally.slower += 1;
      if (v.reaction === "faster") tally.faster += 1;
    }
    return tally;
  }

  /** Reactions still floating, newest per person. */
  activeReactions(now = Date.now()): Map<string | null, ShownReaction> {
    const shown = new Map<string | null, ShownReaction>();
    for (const r of this.reactions) if (now - r.at < REACTION_SHOW_MS) shown.set(r.from, r);
    return shown;
  }

  private pushReaction(from: string | null, reaction: Reaction): void {
    const at = Date.now();
    this.reactions = [
      ...this.reactions.filter((r) => at - r.at < REACTION_SHOW_MS),
      { seq: ++this.reactionSeq, from, reaction, at },
    ].slice(-50);
    if (from && PACE_REACTIONS.includes(reaction)) this.pace.set(from, { reaction, at });
    // Redraw once the reaction has faded (and once the pace vote has expired).
    setTimeout(() => this.onChange(), REACTION_SHOW_MS + 50);
    if (from && PACE_REACTIONS.includes(reaction)) {
      setTimeout(() => this.onChange(), PACE_WINDOW_MS + 50);
    }
    this.onChange();
  }

  /** Sends the screen instead of the camera until sharing stops. */
  async shareScreen(): Promise<void> {
    if (this.screen || !navigator.mediaDevices?.getDisplayMedia) return;
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 10, max: 15 } },
      audio: false,
    });
    const track = display.getVideoTracks()[0];
    if (!track) return;
    track.contentHint = "detail";
    track.addEventListener("ended", () => void this.stopScreen());
    this.screen = track;
    await this.replaceVideo(track);
    this.media = { ...this.media, screen: true };
    this.changed(true);
  }

  async stopScreen(): Promise<void> {
    if (!this.screen) return;
    this.screen.stop();
    this.screen = null;
    await this.replaceVideo(this.camera);
    this.media = { ...this.media, screen: false };
    this.changed(true);
  }

  get screenTrack(): MediaStreamTrack | null {
    return this.screen;
  }

  private async replaceVideo(track: MediaStreamTrack | null): Promise<void> {
    const current = this.local.getVideoTracks()[0];
    if (current && current !== track) this.local.removeTrack(current);
    if (track && !this.local.getVideoTracks().includes(track)) this.local.addTrack(track);
    await Promise.all(
      [...this.links.values()].map((l) => {
        const sender = l.pc
          .getTransceivers()
          .find((t) => t.receiver.track.kind === "video" && t.sender)?.sender;
        return sender?.replaceTrack(track).catch(() => undefined);
      }),
    );
  }

  /** Leaves the call: tells the server at once (survives the page closing) and closes links. */
  leave(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    void fetch(`/api/v1/video/peers/${this.self.participantId}/sync`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: this.self.secret, leave: true }),
    }).catch(() => undefined);
    this.teardown();
  }

  private teardown(): void {
    for (const id of [...this.links.keys()]) this.dropPeer(id);
    for (const t of this.local.getTracks()) t.stop();
    this.screen?.stop();
  }

  /* ----- polling -------------------------------------------------------------------------- */

  private changed(soon = false): void {
    this.onChange();
    if (soon) this.schedule(POLL_FAST_MS);
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    this.timer = null;
    const signals = this.outbox.splice(0, 100);
    const sentStage = this.stageDraft;
    const sentPoll = this.pollAction;
    const sentBreakout = this.breakoutDraft;
    let result: SyncDto;
    try {
      const response = await fetch(`/api/v1/video/peers/${this.self.participantId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          secret: this.self.secret,
          after: this.cursor,
          signals,
          state: this.media,
          ...(sentStage ? { room: sentStage } : {}),
          ...(sentPoll ? { poll: sentPoll } : {}),
          ...(sentBreakout ? { breakout: sentBreakout } : {}),
        }),
      });
      if (response.status === 403 || response.status === 404) {
        this.finish("gone");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      result = (await response.json()) as SyncDto;
      this.failures = 0;
    } catch {
      // Network blip: put the messages back and retry, giving up after about a minute.
      this.outbox.unshift(...signals);
      this.failures += 1;
      if (this.failures > 40) {
        this.finish("error");
        return;
      }
      this.schedule(Math.min(5000, POLL_MS * this.failures));
      return;
    }

    if (result.status !== "LIVE") {
      this.finish(result.status === "ENDED" ? "ended" : "gone");
      return;
    }
    if (this.status === "connecting") this.status = "live";
    this.stage = result.stage;
    // The server applied the change this poll carried (or dropped a spotlight on someone gone).
    if (sentStage && this.stageDraft === sentStage) this.stageDraft = null;
    if (sentPoll && this.pollAction === sentPoll) this.pollAction = null;
    if (sentBreakout && this.breakoutDraft === sentBreakout) this.breakoutDraft = null;
    this.breakout = result.breakout;
    this.noShow = result.noShow;
    // A vote still on its way keeps showing as chosen.
    this.poll =
      result.poll && this.pollAction?.action === "vote" && this.pollAction.pollId === result.poll.id
        ? { ...result.poll, myVote: this.pollAction.option }
        : result.poll;
    this.handRaisedAt = result.handRaisedAt;

    this.reconcile(result.peers);
    for (const s of result.signals) {
      this.cursor = Math.max(this.cursor, s.id);
      await this.handleSignal(s.from, s.kind as SignalKind, s.payload);
    }
    this.onChange();
    this.schedule(this.outbox.length > 0 || result.signals.length > 0 ? POLL_FAST_MS : POLL_MS);
  }

  private finish(status: CallStatus): void {
    this.status = status;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.teardown();
    this.onChange();
  }

  /* ----- peer connections ----------------------------------------------------------------- */

  private reconcile(peers: PeerDto[]): void {
    const seen = new Set(peers.map((p) => p.id));
    for (const id of [...this.links.keys()]) if (!seen.has(id)) this.dropPeer(id);
    for (const p of peers) {
      const link = this.links.get(p.id);
      if (link) link.info = p;
      else {
        this.addPeer(p);
        if (this.self.role === "HOST" && (this.board.length > 0 || this.boardStudentsMayDraw)) {
          this.boardNewcomers.add(p.id);
        }
      }
    }
    for (const id of this.boardNewcomers) {
      if (this.links.has(id)) this.sendBoardHistory(id);
      this.boardNewcomers.delete(id);
    }
    this.tuneBitrates();
  }

  private send(to: string, kind: SignalKind, payload: unknown): void {
    this.outbox.push({ to, kind, payload });
    this.schedule(POLL_FAST_MS);
  }

  private addPeer(info: PeerDto): PeerLink {
    const pc = new RTCPeerConnection({ iceServers: this.self.iceServers });
    const link: PeerLink = {
      info,
      pc,
      stream: new MediaStream(),
      offerer: this.self.participantId < info.id,
      pending: [],
      restartTimer: null,
    };
    this.links.set(info.id, link);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send(info.id, "candidate", e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      for (const old of link.stream.getTracks().filter((t) => t.kind === e.track.kind)) {
        link.stream.removeTrack(old);
      }
      link.stream.addTrack(e.track);
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.recover(link);
      if (pc.connectionState === "connected") this.tuneBitrates();
      this.onChange();
    };

    if (link.offerer) {
      for (const kind of ["audio", "video"] as const) {
        const track =
          kind === "audio"
            ? (this.local.getAudioTracks()[0] ?? null)
            : (this.local.getVideoTracks()[0] ?? null);
        if (track) pc.addTransceiver(track, { direction: "sendrecv", streams: [this.local] });
        else pc.addTransceiver(kind, { direction: "sendrecv" });
      }
      pc.onnegotiationneeded = () => void this.makeOffer(link);
    }
    return link;
  }

  private async makeOffer(link: PeerLink, iceRestart = false): Promise<void> {
    try {
      const offer = await link.pc.createOffer({ iceRestart });
      await link.pc.setLocalDescription(offer);
      this.send(link.info.id, "offer", link.pc.localDescription?.toJSON());
    } catch {
      // The connection was closed meanwhile.
    }
  }

  /** A failed connection gets one ICE restart every few seconds while both stay in the room. */
  private recover(link: PeerLink): void {
    if (link.restartTimer) return;
    link.restartTimer = setTimeout(() => {
      link.restartTimer = null;
      if (link.pc.connectionState !== "failed" || !this.links.has(link.info.id)) return;
      if (link.offerer) void this.makeOffer(link, true);
      else this.send(link.info.id, "restart", null);
    }, 2000);
  }

  private dropPeer(id: string): void {
    const link = this.links.get(id);
    if (!link) return;
    if (link.restartTimer) clearTimeout(link.restartTimer);
    link.pc.close();
    this.links.delete(id);
  }

  private async handleSignal(from: string, kind: SignalKind, payload: unknown): Promise<void> {
    if (kind === "notice") {
      // Only the teacher may send a notice (the server enforces it), and it reaches people in
      // other breakout rooms too, who have no link to the teacher right now.
      const body = payload as { text?: unknown; name?: unknown } | null;
      if (typeof body?.text !== "string" || !body.text.trim()) return;
      const clean = body.text.slice(0, NOTICE_MAX_LENGTH);
      const name =
        typeof body.name === "string" && body.name
          ? body.name
          : (this.links.get(from)?.info.displayName ?? "");
      this.notice = { text: clean, name, at: Date.now() };
      this.chat.push({ id: ++this.chatSeq, from, name, text: clean, at: new Date() });
      this.unread += 1;
      return;
    }
    const link = this.links.get(from);
    if (!link) return;
    const pc = link.pc;
    try {
      if (kind === "offer" && !link.offerer) {
        await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
        for (const t of pc.getTransceivers()) {
          const k = t.receiver.track.kind;
          const track =
            k === "audio" ? this.local.getAudioTracks()[0] : this.local.getVideoTracks()[0];
          if (track && t.sender.track !== track) await t.sender.replaceTrack(track);
          t.direction = "sendrecv";
        }
        await pc.setLocalDescription(await pc.createAnswer());
        this.send(from, "answer", pc.localDescription?.toJSON());
        await this.flushCandidates(link);
      } else if (kind === "answer" && link.offerer) {
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
        await this.flushCandidates(link);
      } else if (kind === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(payload as RTCIceCandidateInit);
        else link.pending.push(payload as RTCIceCandidateInit);
      } else if (kind === "restart" && link.offerer) {
        await this.makeOffer(link, true);
      } else if (kind === "chat") {
        const { text, at } = payload as { text: string; at: string };
        if (typeof text !== "string" || !text.trim()) return;
        this.chat.push({
          id: ++this.chatSeq,
          from: from,
          name: link.info.displayName,
          text: text.slice(0, CHAT_MAX_LENGTH),
          at: new Date(at ?? Date.now()),
        });
        this.unread += 1;
      } else if (kind === "lower" && link.info.role === "HOST" && this.self.role !== "HOST") {
        if (this.media.hand) {
          this.loweredBy = { name: link.info.displayName, at: Date.now() };
          this.setHand(false);
        }
      } else if (kind === "board") {
        const parsed = boardOpSchema.safeParse(payload);
        if (!parsed.success) return;
        const op = parsed.data;
        // Only the teacher clears the board, lets students draw or sends history.
        if (
          (op.op === "clear" || op.op === "allow" || op.op === "sync") &&
          link.info.role !== "HOST"
        ) {
          return;
        }
        this.applyBoard(op, from);
      } else if (kind === "react") {
        const reaction = (payload as { reaction?: unknown } | null)?.reaction;
        if (typeof reaction !== "string" || !REACTIONS.includes(reaction as Reaction)) return;
        // Pace votes are for the teacher; a student's browser ignores them.
        if (PACE_REACTIONS.includes(reaction as Reaction) && this.self.role === "STUDENT") return;
        this.pushReaction(from, reaction as Reaction);
      } else if (kind === "mute" && link.info.role === "HOST" && this.self.role !== "HOST") {
        // Only the teacher's request counts (the server also drops others').
        if (this.media.audio) {
          this.mutedBy = { name: link.info.displayName, at: Date.now() };
          this.setAudio(false);
        }
      }
    } catch {
      // A stale or malformed message; the connection recovers through a restart if needed.
    }
  }

  private async flushCandidates(link: PeerLink): Promise<void> {
    const pending = link.pending.splice(0);
    for (const c of pending) await link.pc.addIceCandidate(c).catch(() => undefined);
  }

  /** Every browser uploads one copy per receiver, so the budget shrinks as the room grows. */
  private tuneBitrates(): void {
    const receivers = this.links.size;
    const maxBitrate = videoBitrate(this.self.role, receivers);
    for (const link of this.links.values()) {
      for (const t of link.pc.getTransceivers()) {
        if (t.receiver.track.kind !== "video" || !t.sender) continue;
        const params = t.sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) continue;
        if (params.encodings[0]!.maxBitrate === maxBitrate) continue;
        params.encodings[0]!.maxBitrate = maxBitrate;
        void t.sender.setParameters(params).catch(() => undefined);
      }
    }
  }
}

/** Camera and microphone for the lobby; whatever the browser allows, possibly nothing. */
export async function openLocalMedia(
  role: PeerDto["role"],
  want: { audio: boolean; video: boolean },
): Promise<{ stream: MediaStream; denied: boolean }> {
  const stream = new MediaStream();
  if (!navigator.mediaDevices?.getUserMedia) return { stream, denied: true };
  const video: MediaTrackConstraints =
    role === "STUDENT"
      ? { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } }
      : { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } };
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true };
  let denied = false;
  for (const [kind, constraints] of [
    ["audio", audio],
    ["video", video],
  ] as const) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ [kind]: constraints });
      for (const t of s.getTracks()) {
        t.enabled = want[kind];
        stream.addTrack(t);
      }
    } catch {
      denied = true;
    }
  }
  return { stream, denied };
}
