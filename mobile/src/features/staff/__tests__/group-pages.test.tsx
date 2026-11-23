import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { Linking } from "react-native";

import type { ChatMessage, CheckingItem, GroupMaterial, GroupMaterials } from "@/api/types";
import { CheckingScreen } from "@/features/staff/checking-screen";
import { GroupChatScreen } from "@/features/staff/group-chat-screen";
import {
  GroupMaterialsScreen,
  nameOf,
  nearestLessons,
} from "@/features/staff/group-materials-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    }),
    useLocalSearchParams: () => ({ id: "g1" }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

/*
 * The teacher's side of a group in the app (A-214): checking answers with
 * their files and a spoken reply, the group's chat, and its materials with
 * adding from the phone. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const GROUP = { id: "g1", name: "GE-Morning A1" };

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

function item(change: Partial<CheckingItem>): CheckingItem {
  return {
    homeworkId: "h1",
    membershipId: "ms1",
    studentId: "s1",
    fullName: "Demo Student One",
    groupId: "g1",
    groupName: "GE-Morning A1",
    lessonDate: "2026-11-21",
    lessonTopic: "Present perfect",
    title: null,
    text: "Exercise 4 on page 31",
    linkUrl: null,
    speaking: false,
    rubric: [],
    note: "Done",
    attachmentUrl: null,
    submittedAt: "2026-11-22T10:00:00.000Z",
    ...change,
  };
}

describe("checking answers in the app", () => {
  function serve(items: CheckingItem[]) {
    fetchMock.mockImplementation(async (url, init) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/homework/queue")) return answer(200, { items, total: items.length });
      if (method === "POST" && url.endsWith("/uploads/documents")) {
        return answer(201, {
          key: "documents/reply.m4a",
          url: "/api/v1/files/documents/reply.m4a",
        });
      }
      if (method === "PATCH") return answer(204);
      return answer(404, { error: { code: "errors.notFound" } });
    });
  }

  it("opens the student's file inside the app and plays a spoken answer in place", async () => {
    serve([
      item({ attachmentUrl: "/api/v1/files/documents/page.jpg" }),
      item({
        homeworkId: "h2",
        speaking: true,
        note: null,
        attachmentUrl: "/api/v1/files/documents/answer.m4a",
        linkUrl: "https://example.org/task",
      }),
    ]);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen(<CheckingScreen />);
    await fireEvent.press(await screen.findByTestId("answer-attachment"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/file",
      params: { url: "/api/v1/files/documents/page.jpg", title: "Demo Student One" },
    });
    expect(screen.getByTestId("answer-audio")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("answer-task-link"));
    expect(open).toHaveBeenCalledWith("https://example.org/task");
    open.mockRestore();
  });

  it("accepts with one press and asks what to fix before returning", async () => {
    serve([item({}), item({ homeworkId: "h2", fullName: "Demo Student Two" })]);
    await renderScreen(<CheckingScreen />);
    const first = await screen.findByTestId("answer-h1-ms1");
    expect(first).toBeTruthy();

    // Return: the first press opens the comment, the second sends it.
    await fireEvent.press(screen.getAllByTestId("return")[0]!);
    expect(calls("PATCH", "/homework/h1/submissions/ms1")).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId("return-comment"), "Check number 3 again");
    await fireEvent.press(screen.getAllByTestId("return")[0]!);
    await waitFor(() => expect(calls("PATCH", "/homework/h1/submissions/ms1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/homework/h1/submissions/ms1")[0]![1])).toEqual({
      status: "RETURNED",
      teacherComment: "Check number 3 again",
    });
    await waitFor(() => expect(screen.queryByTestId("answer-h1-ms1")).toBeNull());

    await fireEvent.press(screen.getByTestId("accept"));
    await waitFor(() => expect(calls("PATCH", "/homework/h2/submissions/ms1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/homework/h2/submissions/ms1")[0]![1])).toEqual({
      status: "ACCEPTED",
      teacherComment: null,
    });
    await settle();
  });

  it("sends a reply recorded on the phone with the verdict", async () => {
    serve([item({ speaking: true, attachmentUrl: "/api/v1/files/documents/answer.m4a" })]);
    await renderScreen(<CheckingScreen />);
    await fireEvent.press(await screen.findByTestId("reply"));
    await fireEvent.press(screen.getByTestId("recorder-start"));
    await fireEvent.press(await screen.findByTestId("recorder-stop"));
    expect(await screen.findByTestId("recorder-clip")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("accept"));
    await waitFor(() => expect(calls("PATCH", "/homework/h1/submissions/ms1")).toHaveLength(1));
    // The recording is stored first; its address goes with the verdict.
    expect(calls("POST", "/uploads/documents")).toHaveLength(1);
    expect(sentBody(calls("PATCH", "/homework/h1/submissions/ms1")[0]![1])).toEqual({
      status: "ACCEPTED",
      teacherComment: null,
      teacherAudioUrl: "/api/v1/files/documents/reply.m4a",
    });
    await settle();
  });
});

describe("the group's chat on the teacher's side", () => {
  const message = (change: Partial<ChatMessage>): ChatMessage => ({
    id: "c1",
    text: "Is there a lesson tomorrow?",
    at: "2026-11-22T10:00:00.000Z",
    source: "WEB",
    author: { kind: "STUDENT", name: "Demo Student One" },
    mine: false,
    ...change,
  });

  it("shows the thread, reads it and sends an answer", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/groups/g1")) return answer(200, GROUP);
      if (method === "POST" && url.endsWith("/chat/read")) return answer(200, { ok: true });
      if (method === "POST" && url.endsWith("/groups/g1/chat")) {
        return answer(
          201,
          message({
            id: "c2",
            text: "Yes, at nine.",
            mine: true,
            author: { kind: "STAFF", name: "T" },
          }),
        );
      }
      if (url.includes("/groups/g1/chat"))
        return answer(200, { messages: [message({})], unread: 1 });
      return answer(404, { error: { code: "errors.notFound" } });
    });
    await renderScreen(<GroupChatScreen />);
    expect(await screen.findByText("Is there a lesson tomorrow?")).toBeTruthy();
    await waitFor(() => expect(calls("POST", "/groups/g1/chat/read")).toHaveLength(1));

    await fireEvent.changeText(screen.getByTestId("chat-input"), "Yes, at nine.");
    await fireEvent.press(screen.getByTestId("chat-send"));
    expect(await screen.findByTestId("chat-message-mine")).toHaveTextContent(/Yes, at nine\./);
    expect(sentBody(calls("POST", "/groups/g1/chat")[0]![1])).toEqual({ text: "Yes, at nine." });
    await settle();
  });
});

describe("the group's materials on the teacher's side", () => {
  const material = (change: Partial<GroupMaterial>): GroupMaterial => ({
    id: "m1",
    lessonId: "l1",
    lessonDate: "2026-11-21",
    lessonTopic: "Present perfect",
    kind: "FILE",
    title: "Unit 3",
    url: "/api/v1/files/documents/unit-3.pdf",
    size: 1000,
    durationSec: null,
    hlsUrl: null,
    resumeSec: null,
    watched: null,
    createdByName: "Demo Teacher",
    createdAt: "2026-11-21T09:00:00.000Z",
    ...change,
  });
  const base: GroupMaterials = {
    items: [
      material({}),
      material({
        id: "m2",
        kind: "RECORDING",
        title: "Lesson recording",
        url: "/api/v1/files/recordings/a.webm",
        hlsUrl: "/api/v1/files/hls/a.m3u8",
        durationSec: 1800,
        watched: { started: 4, finished: 2 },
      }),
    ],
    lessons: [
      { id: "l2", date: "2026-11-24", topic: null },
      { id: "l1", date: "2026-11-21", topic: "Present perfect" },
    ],
  };

  function serve() {
    const added: GroupMaterial[] = [];
    fetchMock.mockImplementation(async (url, init) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/groups/g1")) return answer(200, GROUP);
      if (method === "GET" && url.endsWith("/groups/g1/materials")) {
        return answer(200, { ...base, items: [...added, ...base.items] });
      }
      if (method === "POST" && url.endsWith("/uploads/documents")) {
        return answer(201, { key: "documents/x.pdf", url: "/api/v1/files/documents/x.pdf" });
      }
      if (method === "POST" && url.endsWith("/groups/g1/materials")) {
        const created = material({
          id: "m9",
          title: "Worksheet 5",
          lessonId: null,
          lessonDate: null,
        });
        added.push(created);
        return answer(201, created);
      }
      if (method === "DELETE") return answer(204);
      return answer(404, { error: { code: "errors.notFound" } });
    });
  }

  it("opens a file and a recording inside the app, with who watched", async () => {
    serve();
    await renderScreen(<GroupMaterialsScreen />);
    await fireEvent.press(await screen.findByTestId("material-m1"));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/file",
      params: { url: "/api/v1/files/documents/unit-3.pdf", title: "Unit 3" },
    });
    expect(screen.getByText(/opened by 4, watched to the end by 2/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("material-m2"));
    expect(mockPush.mock.calls.at(-1)![0].params).toMatchObject({
      recording: "1",
      stream: "/api/v1/files/hls/a.m3u8",
      token: "",
    });
  });

  it("adds a file chosen on the phone: stored first, then listed", async () => {
    serve();
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
    await renderScreen(<GroupMaterialsScreen />);
    await fireEvent.press(await screen.findByTestId("material-choose-file"));
    const title = await screen.findByTestId("material-title");
    expect(title.props.value).toBe("worksheet-5");
    await fireEvent.changeText(title, "Worksheet 5");
    await fireEvent.press(screen.getByTestId("material-lesson-l1"));
    await fireEvent.press(screen.getByTestId("material-save"));

    await waitFor(() => expect(calls("POST", "/groups/g1/materials")).toHaveLength(1));
    expect(calls("POST", "/uploads/documents")).toHaveLength(1);
    expect(sentBody(calls("POST", "/groups/g1/materials")[0]![1])).toEqual({
      lessonId: "l1",
      kind: "FILE",
      title: "Worksheet 5",
      url: "/api/v1/files/documents/x.pdf",
    });
    expect(await screen.findByTestId("material-m9")).toBeTruthy();
    await settle();
  });

  it("adds a link for the whole group", async () => {
    serve();
    await renderScreen(<GroupMaterialsScreen />);
    await fireEvent.press(await screen.findByTestId("material-add-link"));
    await fireEvent.press(screen.getByTestId("material-save"));
    // Nothing is sent without a name.
    expect(await screen.findByTestId("material-problem")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("material-url"), "https://example.org/video");
    await fireEvent.changeText(screen.getByTestId("material-title"), "A video to watch");
    await fireEvent.press(screen.getByTestId("material-lesson-general"));
    await fireEvent.press(screen.getByTestId("material-save"));
    await waitFor(() => expect(calls("POST", "/groups/g1/materials")).toHaveLength(1));
    expect(sentBody(calls("POST", "/groups/g1/materials")[0]![1])).toEqual({
      lessonId: null,
      kind: "LINK",
      title: "A video to watch",
      url: "https://example.org/video",
    });
    await settle();
  });

  it("deletes a material only after a second press", async () => {
    serve();
    await renderScreen(<GroupMaterialsScreen />);
    await fireEvent.press(await screen.findByTestId("material-delete-m1"));
    expect(calls("DELETE", "/materials/m1")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("material-delete-yes"));
    await waitFor(() => expect(calls("DELETE", "/materials/m1")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("material-m1")).toBeNull());
    expect(screen.getByTestId("material-m2")).toBeTruthy();
  });

  it("offers the lessons nearest to today and names a file without its ending", () => {
    const lessons = [
      "2026-11-10",
      "2026-11-17",
      "2026-11-19",
      "2026-11-21",
      "2026-11-24",
      "2026-11-26",
      "2026-12-01",
    ].map((date) => ({ id: date, date }));
    expect(nearestLessons(lessons, "2026-11-22", 3).map((l) => l.date)).toEqual([
      "2026-11-24",
      "2026-11-21",
      "2026-11-19",
    ]);
    expect(nameOf({ name: "unit-3.final.pdf" })).toBe("unit-3.final");
    expect(nameOf({ name: "notes" })).toBe("notes");
  });
});
