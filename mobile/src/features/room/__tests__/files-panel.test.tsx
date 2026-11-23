import { fireEvent, screen } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";

import { fakeEngine, openPanel, peer, renderRoom, shown } from "@/features/room/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("react-native-webrtc", () => ({ registerGlobals: jest.fn(), RTCView: "RTCView" }));
jest.mock("react-native-incall-manager", () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
}));

/*
 * "Show a file to everyone" from the teacher's lesson tools, in the app (A-210):
 * the lesson's and the group's materials, one press each.
 */

const LESSON = {
  materials: [
    {
      id: "g1",
      kind: "FILE",
      title: "Course book.pdf",
      url: "/api/v1/files/book.pdf",
      general: true,
    },
    {
      id: "l1",
      kind: "FILE",
      title: "Unit 3 words.png",
      url: "/api/v1/files/words.png",
      general: false,
    },
    { id: "l2", kind: "LINK", title: "Song", url: "https://youtu.be/dQw4w9WgXcQ", general: false },
  ],
};

function answer(body: unknown, ok = true) {
  return jest.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) }),
  );
}

async function openFiles() {
  await openPanel("open-tools");
  await fireEvent.press(screen.getByTestId("tool-files"));
  await screen.findByTestId("room-sheet");
}

describe("showing a file from the app", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("lists the lesson's files first and shows one with a press", async () => {
    const fetchMock = answer(LESSON);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine);
    await openFiles();
    await screen.findByTestId("files-list");

    // The room's own secret is the key; no session is sent.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/video\/peers\/me\/lesson$/);
    expect(JSON.parse(String(init.body))).toEqual({ secret: "room-secret" });

    const rows = screen.getAllByTestId(/^file-(g|l)\d$/).map((row) => row.props.testID);
    expect(rows).toEqual(["file-l1", "file-l2", "file-g1"]);

    await fireEvent.press(screen.getByTestId("file-show-l1"));
    expect(engine.showMaterial).toHaveBeenCalledWith({
      id: "l1",
      title: "Unit 3 words.png",
      kind: "FILE",
      view: "image",
      url: "/api/v1/files/words.png",
    });
  });

  it("knows a YouTube link and a PDF for what they are", async () => {
    globalThis.fetch = answer(LESSON) as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine);
    await openFiles();
    await fireEvent.press(await screen.findByTestId("file-show-l2"));
    expect(engine.showMaterial).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "l2", kind: "LINK", view: "youtube" }),
    );
  });

  it("offers to stop the file that is on everyone's screen", async () => {
    globalThis.fetch = answer(LESSON) as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    engine.currentStage = {
      ...engine.currentStage,
      material: shown({ id: "g1", title: "Course book.pdf", url: "/api/v1/files/book.pdf" }),
    };
    await renderRoom(engine);
    await openFiles();
    expect(await screen.findByTestId("file-g1")).toHaveTextContent(/On everyone's screen now/);
    await fireEvent.press(screen.getByTestId("file-stop-g1"));
    expect(engine.hideMaterial).toHaveBeenCalled();
    expect(engine.showMaterial).not.toHaveBeenCalled();
  });

  it("says so when the list cannot be loaded, and tries again", async () => {
    globalThis.fetch = answer({}, false) as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine);
    await openFiles();
    expect(await screen.findByText("The lesson details could not be loaded.")).toBeTruthy();
    globalThis.fetch = answer({ materials: [] }) as unknown as typeof fetch;
    await fireEvent.press(screen.getByTestId("files-retry"));
    expect(await screen.findByTestId("files-empty")).toBeTruthy();
  });

  it("adds a file from this device to the lesson and lists it", async () => {
    const stored = { key: "documents/x.pdf", url: "/api/v1/files/documents/x.pdf" };
    const lesson = { lesson: { id: "les1" }, materials: [...LESSON.materials] };
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      const reply = (status: number, body: unknown) => ({
        ok: status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      });
      if (url.endsWith("/lesson")) return reply(200, lesson);
      if (url.endsWith("/uploads/documents")) return reply(201, stored);
      if (url.endsWith("/groups/grp/materials") && init?.method === "POST") {
        lesson.materials.push({
          id: "l9",
          kind: "FILE",
          title: "worksheet-5",
          url: stored.url,
          general: false,
        });
        return reply(201, { id: "l9" });
      }
      return reply(404, {});
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///docs/worksheet-5.pdf",
          name: "worksheet-5.pdf",
          mimeType: "application/pdf",
          size: 5000,
        },
      ],
    });
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine, { groupId: "grp" });
    await openFiles();
    await fireEvent.press(await screen.findByTestId("files-add-file"));
    expect(await screen.findByTestId("file-l9")).toBeTruthy();
    const post = fetchMock.mock.calls.find(([url]) => url.endsWith("/groups/grp/materials"))!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      lessonId: "les1",
      kind: "FILE",
      title: "worksheet-5",
      url: stored.url,
    });
  });

  it("has no adding without the teacher's group", async () => {
    globalThis.fetch = answer(LESSON) as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine);
    await openFiles();
    await screen.findByTestId("files-list");
    expect(screen.queryByTestId("files-add")).toBeNull();
  });

  it("is not offered to a student", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    await renderRoom(engine);
    await screen.findByTestId("call-room");
    expect(screen.queryByTestId("open-tools")).toBeNull();
  });
});
