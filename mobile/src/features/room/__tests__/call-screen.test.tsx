import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CallScreen } from "@/features/room/call-screen";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import type { CallEngine, RemotePeer } from "@kampus/lib/video/call-engine";
import type { JoinDto, StageDto } from "@kampus/lib/video/dto";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
// The phone's own WebRTC and loudspeaker are native code; a test draws a plain view instead.
jest.mock("react-native-webrtc", () => ({ registerGlobals: jest.fn(), RTCView: "RTCView" }));
jest.mock("react-native-incall-manager", () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
}));

/*
 * The lesson room in the app (A-207), drawn over a stand-in for the call
 * engine: what the buttons ask the engine to do, and who a teacher and a
 * student see where. The engine itself and the rules of the stage have their
 * own tests on the site's side (tests/unit/video-*.test.ts).
 */

type Stream = MediaStream & { toURL(): string };

function stream(id: string, camera = true): Stream {
  const video = camera ? [{ id: `${id}-video`, kind: "video" }] : [];
  return {
    id,
    getVideoTracks: () => video,
    getAudioTracks: () => [{ id: `${id}-audio`, kind: "audio" }],
    toURL: () => `stream:${id}`,
  } as unknown as Stream;
}

function peer(id: string, name: string, change: Partial<RemotePeer> = {}): RemotePeer {
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
function fakeEngine(role: JoinDto["role"], others: RemotePeer[]) {
  const listeners = new Set<() => void>();
  const stage: StageDto = { spotlight: null, focus: false, board: false, material: null };
  const engine = {
    self: {
      participantId: "me",
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
    notice: null as { text: string; name: string; at: number } | null,
    noShow: null,
    poll: null,
    breakout: { rooms: 0, endsAt: null, mine: null, everyone: null },
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
    dismissNotice: jest.fn(),
    switchCamera: jest.fn(),
    /** Tells the screen something changed, as the real engine does after every sync. */
    change(update: () => void) {
      update();
      engine.version += 1;
      listeners.forEach((listener) => listener());
    },
  };
  return engine;
}

type Fake = ReturnType<typeof fakeEngine>;

async function renderRoom(engine: Fake, props: { onEndForAll?: () => Promise<void> } = {}) {
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

describe("the lesson room in the app", () => {
  it("turns the microphone, the camera and a student's hand on and off through the engine", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    await renderRoom(engine);
    await screen.findByTestId("call-room");

    await fireEvent.press(screen.getByTestId("toggle-mic"));
    expect(engine.setAudio).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByTestId("toggle-camera"));
    expect(engine.setVideo).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByTestId("toggle-hand"));
    expect(engine.setHand).toHaveBeenCalledWith(true);
  });

  it("gives a teacher no hand to raise, and asks before ending the lesson for everyone", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    const onEndForAll = jest.fn(() => Promise.resolve());
    const { onLeave } = await renderRoom(engine, { onEndForAll });
    await screen.findByTestId("call-room");
    expect(screen.queryByTestId("toggle-hand")).toBeNull();

    await fireEvent.press(screen.getByTestId("leave"));
    expect(onLeave).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByTestId("end-for-all"));
    await waitFor(() => expect(onEndForAll).toHaveBeenCalledTimes(1));
  });

  it("lets a student leave in one press", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    const { onLeave } = await renderRoom(engine);
    await fireEvent.press(await screen.findByTestId("leave"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("shows a teacher everyone as equal tiles, and a student the teacher on the stage", async () => {
    const teacherRoom = fakeEngine("HOST", [
      peer("a", "Aziza Karimova"),
      peer("b", "Bobur Aliyev"),
    ]);
    await renderRoom(teacherRoom);
    await screen.findByTestId("tile-wall");
    await screen.unmount();

    const studentRoom = fakeEngine("STUDENT", [
      peer("t", "Demo Teacher", { role: "HOST" }),
      peer("a", "Aziza Karimova"),
    ]);
    await renderRoom(studentRoom);
    await screen.findByTestId("tile-t");
    expect(screen.queryByTestId("tile-wall")).toBeNull();
    expect(screen.getByTestId("tile-self")).toBeTruthy();
    expect(screen.getByTestId("tile-a")).toBeTruthy();
  });

  it("hides the other students from a student while the teacher keeps the class in focus", async () => {
    const engine = fakeEngine("STUDENT", [
      peer("t", "Demo Teacher", { role: "HOST" }),
      peer("a", "Aziza Karimova"),
    ]);
    await renderRoom(engine);
    await screen.findByTestId("tile-a");
    await act(async () => {
      engine.change(() => {
        engine.currentStage = { ...engine.currentStage, focus: true };
      });
    });
    await waitFor(() => expect(screen.queryByTestId("tile-a")).toBeNull());
    expect(screen.getByTestId("tile-t")).toBeTruthy();
  });

  it("sends a chat line and counts lines as read while the chat is open", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.unread = 2;
    await renderRoom(engine);
    await fireEvent.press(await screen.findByTestId("open-chat"));
    await waitFor(() => expect(engine.markChatRead).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId("chat-input"), "Salom!");
    await fireEvent.press(screen.getByTestId("chat-send"));
    expect(engine.sendChat).toHaveBeenCalledWith("Salom!");
  });

  it("lets the teacher mute everyone, lower a hand and show one person to the class", async () => {
    const engine = fakeEngine("HOST", [
      peer("a", "Aziza Karimova", {
        media: { audio: true, video: true, screen: false, hand: true },
        handRaisedAt: "2026-11-23T05:10:00.000Z",
      }),
    ]);
    await renderRoom(engine);
    await fireEvent.press(await screen.findByTestId("open-people"));

    await fireEvent.press(await screen.findByTestId("mute-all"));
    expect(engine.mutePeers).toHaveBeenCalledWith();
    await fireEvent.press(screen.getByTestId("lower-a"));
    expect(engine.lowerHand).toHaveBeenCalledWith("a");
    await fireEvent.press(screen.getByTestId("mute-a"));
    expect(engine.mutePeers).toHaveBeenCalledWith(["a"]);
    await fireEvent.press(screen.getByTestId("spotlight-a"));
    expect(engine.setStage).toHaveBeenCalledWith({ spotlight: "a" });
    await fireEvent.press(screen.getByTestId("toggle-focus"));
    expect(engine.setStage).toHaveBeenCalledWith({ focus: true });
  });

  it("says so when the teacher shows a whiteboard the app cannot draw yet", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("call-room");
    expect(screen.getByText(/whiteboard|file/i)).toBeTruthy();
    // Nobody is hidden behind the notice: everyone is on the wall, the teacher too.
    await fireEvent(screen.getByTestId("tile-wall"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 520 } },
    });
    expect(await screen.findByTestId("tile-t")).toBeTruthy();
    expect(screen.getByTestId("tile-self")).toBeTruthy();
  });

  it("shows a message from the teacher until it is closed", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.notice = { text: "Open page 14", name: "Demo Teacher", at: 1 };
    await renderRoom(engine);
    const notice = await screen.findByTestId("host-notice");
    expect(notice).toHaveTextContent(/Demo Teacher:\s+Open page 14/);
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(engine.dismissNotice).toHaveBeenCalledTimes(1);
  });
});
