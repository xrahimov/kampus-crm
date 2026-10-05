import type { SignalKind } from "@/lib/validation/video";
import type { JoinDto, PeerDto, SyncDto } from "@/server/services/video/video.service";

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
}

export interface RemotePeer {
  id: string;
  displayName: string;
  role: PeerDto["role"];
  joinedAt: string;
  media: MediaState | null;
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
        media: l.info.media,
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
      else this.addPeer(p);
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
