import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useCameraPermissions } from "expo-camera";
import { Linking } from "react-native";

import type { ScanResult } from "@/api/scan";
import type { Today, TodayLesson } from "@/api/types";
import { ScanScreen } from "@/features/scan/scan-screen";
import { LessonPanel } from "@/features/staff/lesson-panel";
import { TodayScreen } from "@/features/staff/today-screen";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));
let mockPermissions: string[] = [];
jest.mock("@/lib/session", () => ({
  useMe: () => ({ permissions: mockPermissions }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ wide: false, width: 390, height: 820, columns: 1 }),
}));

/*
 * Attendance by badge, in the app (A-264): a code from the camera, a hand
 * scanner or the keyboard marks its student present, and every badge gets a
 * line saying what the server made of it. Each test plays the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;
const permissions = useCameraPermissions as jest.Mock;

const ALLOWED = { granted: true, canAskAgain: true, status: "granted", expires: "never" };
const REFUSED = { granted: false, canAskAgain: false, status: "denied", expires: "never" };
const CODE = "kampus:student:s1";

function result(over: Partial<ScanResult> = {}): ScanResult {
  return {
    status: "marked",
    studentId: "s1",
    studentName: "Sardor Karimov",
    groupName: "GE-Morning A1",
    lessonTime: "19:30–21:00",
    lessonId: "l1",
    ...over,
  };
}
/** The server answers every badge with what the test hands it, in turn. */
function serve(...answers: (ScanResult | Response)[]) {
  let at = 0;
  fetchMock.mockImplementation(async (url) => {
    if (!url.endsWith("/attendance/scan")) return answer(200, { enabled: false, room: null });
    const next = answers[Math.min(at, answers.length - 1)]!;
    at += 1;
    return "ok" in next ? next : answer(200, next);
  });
}
const scans = () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/attendance/scan"));

beforeEach(() => {
  mockParams = {};
  mockPermissions = ["groups.attendance.mark"];
  mockPush.mockReset();
  fetchMock.mockReset();
  permissions.mockReset();
  permissions.mockReturnValue([ALLOWED, jest.fn(async () => ALLOWED), jest.fn()]);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  clearClients();
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("a typed badge code", () => {
  it("marks the student on the lesson the screen was opened for and says who", async () => {
    mockParams = { lesson: "l1", group: "GE-Morning A1", time: "19:30–21:00" };
    serve(result());
    await renderScreen(<ScanScreen />);
    expect(screen.getByTestId("scan-target")).toHaveTextContent(/GE-Morning A1, 19:30–21:00/);
    expect(screen.getByTestId("scan-count")).toHaveTextContent("Nobody marked yet");
    expect(screen.getByTestId("scan-send")).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId("scan-code"), `  ${CODE} `);
    await fireEvent.press(screen.getByTestId("scan-send"));
    expect(await screen.findByTestId("scan-line-1")).toHaveTextContent(/Sardor Karimov/);
    expect(screen.getByTestId("scan-line-1")).toHaveTextContent(/GE-Morning A1, 19:30–21:00/);
    expect(screen.getByTestId("scan-status-1")).toHaveTextContent("Present");
    expect(screen.getByTestId("scan-count")).toHaveTextContent("1 marked present");
    expect(sentBody(scans()[0]![1])).toEqual({ code: CODE, lessonId: "l1" });
    expect(screen.getByTestId("scan-code").props.value).toBe("");
  });

  it("goes on Enter, as a hand scanner sends it, and names no lesson at the door", async () => {
    serve(result());
    await renderScreen(<ScanScreen />);
    expect(screen.getByTestId("scan-target")).toHaveTextContent(/their lesson of the day/);
    await fireEvent.changeText(screen.getByTestId("scan-code"), CODE);
    await fireEvent(screen.getByTestId("scan-code"), "submitEditing");
    await screen.findByTestId("scan-line-1");
    expect(sentBody(scans()[0]![1])).toEqual({ code: CODE });

    // The same code typed again is sent again: only the camera's repeats are held back.
    await fireEvent.changeText(screen.getByTestId("scan-code"), CODE);
    await fireEvent(screen.getByTestId("scan-code"), "submitEditing");
    await screen.findByTestId("scan-line-2");
    expect(scans()).toHaveLength(2);
  });

  it("sends the whole code when Enter comes before its last letter has arrived (A-266)", async () => {
    serve(result(), result({ status: "unknown", studentId: null, studentName: null }));
    await renderScreen(<ScanScreen />);
    // A hand scanner types and presses Enter in one go: the field's last change is a letter short.
    await fireEvent.changeText(screen.getByTestId("scan-code"), CODE.slice(0, -1));
    await fireEvent(screen.getByTestId("scan-code"), "submitEditing", {
      nativeEvent: { text: CODE },
    });
    await screen.findByTestId("scan-line-1");
    expect(sentBody(scans()[0]![1])).toEqual({ code: CODE });
    expect(screen.getByTestId("scan-code").props.value).toBe("");
    // On a phone the newest badge is said under the field, above the keyboard.
    expect(screen.getByTestId("scan-last")).toHaveTextContent(/Sardor Karimov.*Present/);

    // Nothing left over from the first code goes with the next one.
    await fireEvent.changeText(screen.getByTestId("scan-code"), "nonsense");
    await fireEvent.press(screen.getByTestId("scan-send"));
    await screen.findByTestId("scan-line-2");
    expect(sentBody(scans()[1]![1])).toEqual({ code: "nonsense" });
    expect(screen.getByTestId("scan-last")).toHaveTextContent(/nonsense.*Not a badge/);
  });

  it("gets a line saying what the server made of it, newest first", async () => {
    serve(
      result({ status: "already" }),
      result({ status: "noLesson", groupName: null, lessonTime: null, lessonId: null }),
      result({ status: "unknown", studentId: null, studentName: null, groupName: null }),
    );
    await renderScreen(<ScanScreen />);
    for (const code of [CODE, "kampus:student:s2", "not a badge"]) {
      await fireEvent.changeText(screen.getByTestId("scan-code"), code);
      await fireEvent.press(screen.getByTestId("scan-send"));
      await waitFor(() => expect(screen.getByTestId("scan-code").props.value).toBe(""));
    }
    expect(await screen.findByTestId("scan-status-3")).toHaveTextContent("Not a badge");
    expect(screen.getByTestId("scan-line-3")).toHaveTextContent(/not a badge/);
    expect(screen.getByTestId("scan-status-2")).toHaveTextContent("No lesson today");
    expect(screen.getByTestId("scan-status-1")).toHaveTextContent("Already present");
    expect(screen.getByTestId("scan-count")).toHaveTextContent("Nobody marked yet");
    const log = JSON.stringify(screen.getByTestId("scan-log").children);
    expect(log.indexOf("scan-line-3")).toBeLessThan(log.indexOf("scan-line-1"));
  });

  it("shows why the server refused it", async () => {
    serve(answer(403, { error: { code: "FORBIDDEN", message: "errors.forbidden" } }));
    await renderScreen(<ScanScreen />);
    await fireEvent.changeText(screen.getByTestId("scan-code"), CODE);
    await fireEvent.press(screen.getByTestId("scan-send"));
    expect(await screen.findByTestId("scan-status-1")).toHaveTextContent("Error");
    expect(screen.getByTestId("scan-line-1")).toHaveTextContent(
      /You do not have permission to do this/,
    );
  });
});

describe("the camera", () => {
  it("stays off until it is started, then sends a badge once while it stays in view", async () => {
    serve(result(), result({ studentId: "s2", studentName: "Aziza Karimova" }), result());
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    await renderScreen(<ScanScreen />);
    expect(screen.queryByTestId("scan-camera")).toBeNull();

    await fireEvent.press(screen.getByTestId("scan-start"));
    const camera = await screen.findByTestId("scan-camera");
    expect(camera.props.barcodeScannerSettings).toEqual({ barcodeTypes: ["qr"] });
    await fireEvent(camera, "barcodeScanned", { data: CODE });
    clock.mockReturnValue(1_000_300);
    await fireEvent(camera, "barcodeScanned", { data: CODE });
    await fireEvent(camera, "barcodeScanned", { data: "kampus:student:s2" });
    expect(await screen.findByTestId("scan-line-2")).toHaveTextContent(/Aziza Karimova/);
    expect(scans()).toHaveLength(2);
    expect(sentBody(scans()[0]![1])).toEqual({ code: CODE });

    // The same badge a few seconds later is a new try.
    clock.mockReturnValue(1_004_100);
    await fireEvent(camera, "barcodeScanned", { data: CODE });
    await screen.findByTestId("scan-line-3");
    expect(scans()).toHaveLength(3);

    await fireEvent.press(screen.getByTestId("scan-stop"));
    expect(screen.queryByTestId("scan-camera")).toBeNull();
    expect(screen.getByTestId("scan-start")).toBeTruthy();
  });

  it("is asked for the first time, and a refusal leads to the device's settings", async () => {
    const ask = jest.fn(async () => REFUSED);
    permissions.mockReturnValue([{ ...REFUSED, canAskAgain: true }, ask, jest.fn()]);
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    serve(result());
    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("scan-start"));
    expect(await screen.findByTestId("scan-denied")).toHaveTextContent(/type the code below/);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("scan-camera")).toBeNull();
    // Refused for good: only the settings can change it.
    await fireEvent.press(screen.getByTestId("scan-settings"));
    expect(settings).toHaveBeenCalledTimes(1);
    // The code can still be typed.
    await fireEvent.changeText(screen.getByTestId("scan-code"), CODE);
    await fireEvent.press(screen.getByTestId("scan-send"));
    expect(await screen.findByTestId("scan-status-1")).toHaveTextContent("Present");
  });

  it("says so when the device cannot open it", async () => {
    permissions.mockReturnValue([
      null,
      jest.fn(async () => Promise.reject(new Error("no camera"))),
      jest.fn(),
    ]);
    serve(result());
    await renderScreen(<ScanScreen />);
    await fireEvent.press(screen.getByTestId("scan-start"));
    expect(await screen.findByTestId("scan-no-camera")).toHaveTextContent(/hand scanner/);
  });
});

describe("the way to the scanner", () => {
  const LESSON: TodayLesson = {
    id: "l1",
    groupId: "g1",
    groupName: "GE-Morning A1",
    courseName: "General English",
    color: null,
    date: "2026-11-24",
    startTime: "19:30",
    endTime: "21:00",
    roomName: "Room 101",
    topic: null,
    suggestedTopic: null,
    isExtra: false,
    teacherNames: [],
    members: [
      {
        membershipId: "m1",
        studentId: "s1",
        fullName: "Sardor Karimov",
        status: "ACTIVE",
        attendance: "NOT_MARKED",
        comment: null,
        balance: null,
      },
    ],
    present: 0,
    marked: 0,
    homework: null,
  };
  const day = (over: Partial<Today> = {}): Today => ({
    date: "2026-11-24",
    today: "2026-11-24",
    lessons: [LESSON],
    next: null,
    debtors: [],
    debtorCount: 0,
    debtTotal: 0,
    canMark: true,
    canSeeBalances: false,
    ...over,
  });
  const serveDay = (shown: Today) =>
    fetchMock.mockImplementation(async (url) =>
      url.includes("/today")
        ? answer(200, shown)
        : url.includes("/video")
          ? answer(200, { enabled: false, room: null, todayLesson: null })
          : answer(200, { month: "2026-11", lessons: [], members: [] }),
    );

  it("is on a lesson's attendance, for that lesson", async () => {
    serveDay(day());
    await renderScreen(<LessonPanel lesson={LESSON} canMark canSeeBalances={false} />);
    await fireEvent.press(screen.getByTestId("scan-badges"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/staff/scan",
      params: { lesson: "l1", group: "GE-Morning A1", time: "19:30–21:00" },
    });
  });

  it("is not on a lesson somebody only reads", async () => {
    serveDay(day());
    await renderScreen(<LessonPanel lesson={LESSON} canMark={false} canSeeBalances={false} />);
    expect(screen.getByTestId("attendance-summary")).toBeTruthy();
    expect(screen.queryByTestId("scan-badges")).toBeNull();
  });

  it("is on Today for the door, for whoever marks lessons", async () => {
    serveDay(day());
    await renderScreen(<TodayScreen />);
    await fireEvent.press(await screen.findByTestId("scan-door"));
    expect(mockPush).toHaveBeenCalledWith("/staff/scan");
  });

  it("is not on another day, nor for someone who may not mark", async () => {
    serveDay(day({ date: "2026-11-23" }));
    await renderScreen(<TodayScreen />);
    await screen.findByText("GE-Morning A1");
    expect(screen.queryByTestId("scan-door")).toBeNull();

    clearClients();
    serveDay(day({ canMark: false }));
    await renderScreen(<TodayScreen />);
    await waitFor(() => expect(screen.getAllByText("GE-Morning A1").length).toBeGreaterThan(0));
    expect(screen.queryByTestId("scan-door")).toBeNull();
  });

  it("refuses the screen itself to someone who may not mark attendance", async () => {
    mockPermissions = ["groups.view"];
    serve(result());
    await renderScreen(<ScanScreen />);
    expect(screen.getByTestId("scan-forbidden")).toHaveTextContent(
      /You do not have permission to do this/,
    );
    expect(screen.queryByTestId("scan-code")).toBeNull();
  });
});
