import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CallScreen } from "@/features/room/call-screen";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import type { CallEngine, RemotePeer } from "@kampus/lib/video/call-engine";
import type {
  BreakoutDto,
  JoinDto,
  PollDto,
  ShownMaterialDto,
  StageDto,
} from "@kampus/lib/video/dto";

/*
 * What the lesson room's tests share: a stand-in for the call engine (everything
 * the screen reads, with every action a spy) and the room drawn over it. The
 * engine itself has its own tests on the site's side (tests/unit/video-*.test.ts).
 * Each test file still mocks WebRTC and the loudspeaker itself; jest wants that there.
 * The stage's PDF view, video player and web view are mocked for every test in
 * jest.setup.js.
 */

/** A file on everyone's stage, as the server describes it. */
export function shown(change: Partial<ShownMaterialDto> = {}): ShownMaterialDto {
  return {
    id: "m1",
    title: "Unit 3",
    kind: "FILE",
    view: "pdf",
    url: "/api/v1/public/class/tok/files/unit-3.pdf",
    page: 1,
    playing: false,
    position: 0,
    at: "2026-11-23T05:00:00.000Z",
    ...change,
  };
}

export type Stream = MediaStream & { toURL(): string };

export function stream(id: string, camera = true): Stream {
  const video = camera ? [{ id: `${id}-video`, kind: "video" }] : [];
  return {
    id,
    getVideoTracks: () => video,
    getAudioTracks: () => [{ id: `${id}-audio`, kind: "audio" }],
    toURL: () => `stream:${id}`,
  } as unknown as Stream;
}

export function peer(id: string, name: string, change: Partial<RemotePeer> = {}): RemotePeer {
  return {
    id,
    displayName: name,
    role: "STUDENT",
    joinedAt: "2026-11-23T05:00:00.000Z",
    media: { audio: true, video: true, screen: false, hand: false },
    handRaisedAt: null,
    stream: stream(id),
    connection: "connected",
    ...change,
  };
}

/** Everything the screen reads from the engine, with every action a spy. */
export function fakeEngine(role: JoinDto["role"], others: RemotePeer[]) {
  const listeners = new Set<() => void>();
  const stage: StageDto = { spotlight: null, focus: false, board: false, material: null };
  const engine = {
    self: {
      participantId: "me",
      secret: "room-secret",
      displayName: role === "HOST" ? "Demo Teacher" : "Demo Student",
      role,
      groupName: "GE-Morning A1",
    },
    version: 0,
    media: { audio: true, video: true, screen: false, hand: false },
    chat: [] as Array<{ id: number; from: string | null; name: string; text: string; at: Date }>,
    unread: 0,
    mutedBy: null as { name: string; at: number } | null,
    loweredBy: null,
    shareError: null as { reason: "blocked" | "unreadable" | "failed"; at: number } | null,
    notice: null as { text: string; name: string; at: number } | null,
    noShow: null,
    poll: null as PollDto | null,
    pollPending: false,
    pollUnseen: true,
    breakout: { rooms: 0, endsAt: null, mine: null, everyone: null } as BreakoutDto,
    handRaisedAt: null as string | null,
    canSwitchCamera: false,
    currentStage: stage,
    localStream: stream("me"),
    remote: others,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => engine.version,
    peers: () => engine.remote,
    activeReactions: () => new Map(),
    paceTally: () => ({ slower: 0, faster: 0 }),
    setAudio: jest.fn(),
    setVideo: jest.fn(),
    setHand: jest.fn(),
    sendChat: jest.fn(),
    markChatRead: jest.fn(),
    mutePeers: jest.fn(),
    lowerHand: jest.fn(),
    setStage: jest.fn(),
    react: jest.fn(),
    votePoll: jest.fn(),
    openPoll: jest.fn(),
    closePoll: jest.fn(),
    markPollSeen: jest.fn(),
    startBreakout: jest.fn(),
    moveToRoom: jest.fn(),
    endBreakout: jest.fn(),
    sendNotice: jest.fn(),
    dismissNotice: jest.fn(),
    switchCamera: jest.fn(),
    boardVersion: 0,
    boardStudentsMayDraw: false,
    strokes: [] as Array<{
      id: string;
      color: string;
      width: number;
      erase: boolean;
      layer: string;
      points: Array<[number, number]>;
      by: string | null;
    }>,
    get canDraw(): boolean {
      return role !== "STUDENT" || engine.boardStudentsMayDraw;
    },
    boardLayer: (layer: string) => engine.strokes.filter((s) => s.layer === layer),
    drawStroke: jest.fn(),
    undoStroke: jest.fn(),
    clearBoard: jest.fn(),
    setStudentsMayDraw: jest.fn(),
    shareScreen: jest.fn(() => Promise.resolve()),
    stopScreen: jest.fn(() => Promise.resolve()),
    dismissShareError: jest.fn(),
    showMaterial: jest.fn(),
    hideMaterial: jest.fn(),
    turnMaterialPage: jest.fn(),
    setMaterialPlayback: jest.fn(),
    serverNow: () => Date.parse("2026-11-23T05:00:00.000Z"),
    /** Tells the screen something changed, as the real engine does after every sync. */
    change(update: () => void) {
      update();
      engine.version += 1;
      listeners.forEach((listener) => listener());
    },
  };
  return engine;
}

export type Fake = ReturnType<typeof fakeEngine>;

/** Opens one of the room's sheets and waits until it takes presses (it ignores the press that opened it). */
export async function openPanel(control: string) {
  await fireEvent.press(await screen.findByTestId(control));
  await screen.findByTestId("room-sheet");
}

export async function renderRoom(
  engine: Fake,
  props: { onEndForAll?: () => Promise<void>; groupId?: string } = {},
) {
  const onLeave = jest.fn();
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <I18nProvider>
          <CallScreen engine={engine as unknown as CallEngine} onLeave={onLeave} {...props} />
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { onLeave };
}
