import { notifyManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useState, type ReactElement } from "react";
import { Platform } from "react-native";

import type { TeacherDetail } from "@/api/office-catalog";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Avatar } from "@/components/surface";
import { TeacherFormSheet } from "@/features/catalog/teacher-form";
import { PhotoField } from "@/features/files/photo-field";
import { StudentFormSheet } from "@/features/office/student-form";
import { answer, clearClients, renderScreen, sentBody } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock("@/lib/session", () => ({
  useMe: () => ({
    user: { id: "u1", fullName: "Dilnoza Karimova", hasSalary: false, photoUrl: null },
    roles: [{ code: "ADMIN", name: "Admin" }],
    permissions: ["teachers.view", "teachers.create", "teachers.update", "students.update"],
    view: { current: "FULL", canSwitch: false },
    branches: [{ id: "b1", name: "Chilonzor" }],
    activeBranch: { id: "b1", name: "Chilonzor" },
  }),
  can: (me: { permissions: string[] } | null, permission: string) =>
    Boolean(me?.permissions.includes(permission)),
}));
const mockChoosePhoto = jest.fn();
jest.mock("@/features/files/pick", () => ({
  choosePhoto: (options: unknown) => mockChoosePhoto(options),
}));

/*
 * A person's photo (A-255): the photo field of the staff and student forms,
 * and the round picture that stands where the initials stood. Each test plays
 * the phone's photo library and the server.
 */

type Call = [url: string, init?: RequestInit];
const fetchMock = jest.fn<Promise<Response>, Call>();
const realFetch = globalThis.fetch;

beforeAll(() => notifyManager.setScheduler((flush) => queueMicrotask(flush)));
afterAll(() => notifyManager.setScheduler((flush) => setTimeout(flush, 0)));

beforeEach(() => {
  fetchMock.mockReset();
  mockChoosePhoto.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(async () => {
  await settled();
  client = null;
  clearClients();
  globalThis.fetch = realFetch;
});

let client: QueryClient | null = null;
async function show(element: ReactElement): Promise<void> {
  client = await renderScreen(element);
}

/** Lets every answer arrive and be drawn, all of it inside React's `act`. */
async function settled(): Promise<void> {
  const asked = client;
  if (!asked) return;
  await act(async () => {
    for (let turn = 0; turn < 100; turn++) {
      await new Promise((done) => setTimeout(done, 5));
      if (turn > 0 && asked.isFetching() + asked.isMutating() === 0) break;
    }
  });
}

function calls(method: string, tail: string): Call[] {
  return fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? "GET") === method && url.split("?")[0]!.endsWith(tail),
  );
}

type Routes = Record<string, unknown | (() => unknown)>;
/** A route answers with a body, with a whole answer made by `answer`, or with one that comes later. */
function serve(routes: Routes) {
  fetchMock.mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.split("?")[0]!;
    const key = Object.keys(routes).find((k) => {
      const [verb, tail] = k.split(" ") as [string, string];
      return verb === method && path.endsWith(tail);
    });
    if (!key) return answer(404, { error: { code: "errors.notFound" } });
    const route = routes[key];
    const body = await (typeof route === "function" ? (route as () => unknown)() : route);
    if (body && typeof body === "object" && "ok" in body && "text" in body) return body as Response;
    return answer(body === undefined ? 204 : 200, body);
  });
}

const PHOTO = { uri: "file:///me.jpg", name: "me.jpg", type: "image/jpeg", size: 90_000 };
const KEPT = { key: "photos/new.jpg", url: "/api/v1/files/photos/new.jpg", size: 90_000 };
const chosen = () => mockChoosePhoto.mockResolvedValue({ kind: "file", file: PHOTO });

/** The field on a form that only remembers the photo's address. */
function Form({ first = null }: { first?: string | null }) {
  const [photo, setPhoto] = useState<string | null>(first);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PhotoField value={photo} name="Aziz Rahimov" onChange={setPhoto} onBusy={setBusy} />
      <Button label={photo ?? "no photo"} disabled={busy} onPress={() => undefined} testID="save" />
    </>
  );
}

describe("the round picture of a person", () => {
  it("is their photo, asked of the server with the session", async () => {
    await show(<Avatar name="Aziz Rahimov" photo="/api/v1/files/photos/a.jpg" />);
    const picture = screen.getByTestId("avatar-photo");
    expect(picture.props.source.uri).toMatch(/\/api\/v1\/files\/photos\/a\.jpg$/);
    expect(screen.queryByText("AR")).toBeNull();
  });

  it("is their initials without a photo, and when the photo does not load", async () => {
    await show(
      <>
        <Avatar name="Malika Yusupova" />
        <Avatar name="Aziz Rahimov" photo="/api/v1/files/photos/gone.jpg" />
      </>,
    );
    expect(screen.getByText("MY")).toBeOnTheScreen();
    await act(async () => screen.getByTestId("avatar-photo").props.onError());
    expect(screen.queryByTestId("avatar-photo")).toBeNull();
    expect(screen.getByText("AR")).toBeOnTheScreen();
  });
});

describe("the round picture in a browser", () => {
  const realOS = Platform.OS;
  const realMake = URL.createObjectURL;
  const realDrop = URL.revokeObjectURL;
  beforeEach(() => {
    Platform.OS = "web";
    URL.createObjectURL = jest.fn(() => "blob:photo");
    URL.revokeObjectURL = jest.fn();
  });
  afterEach(() => {
    Platform.OS = realOS;
    URL.createObjectURL = realMake;
    URL.revokeObjectURL = realDrop;
  });

  it("is fetched with the session first, the initials standing in until it is there", async () => {
    let arrive: (answer: unknown) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise((done) => (arrive = done as never)));
    await show(<Avatar name="Aziz Rahimov" photo="/api/v1/files/photos/a.jpg" />);
    // A browser's picture cannot send the session, so nothing is drawn from the address itself.
    expect(screen.queryByTestId("avatar-photo")).toBeNull();
    expect(screen.getByText("AR")).toBeOnTheScreen();
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/api\/v1\/files\/photos\/a\.jpg$/);
    expect(fetchMock.mock.calls[0]![1]!.headers).toHaveProperty("x-kampus-app");
    await act(async () => arrive({ ok: true, blob: async () => ({}) }));
    expect((await screen.findByTestId("avatar-photo")).props.source).toEqual({ uri: "blob:photo" });
  });

  it("stays the initials when the server does not give the photo", async () => {
    fetchMock.mockResolvedValue(answer(401, { error: { code: "errors.unauthorized" } }));
    await show(<Avatar name="Aziz Rahimov" photo="/api/v1/files/photos/a.jpg" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(screen.queryByTestId("avatar-photo")).toBeNull();
    expect(screen.getByText("AR")).toBeOnTheScreen();
  });
});

describe("the photo field of a form", () => {
  it("sends the chosen photo at once and keeps the address the server gives", async () => {
    chosen();
    serve({ "POST /uploads": KEPT });
    await show(<Form />);
    expect(screen.getByText("Photo")).toBeOnTheScreen();
    expect(screen.getByText("AR")).toBeOnTheScreen();
    expect(screen.queryByTestId("photo-remove")).toBeNull();
    await fireEvent.press(screen.getByTestId("photo-choose"));
    await waitFor(() => expect(screen.getByTestId("save")).toHaveTextContent(KEPT.url));
    // A small square photo is asked of the phone: the server takes up to 2 MB.
    expect(mockChoosePhoto).toHaveBeenCalledWith({ smallSquare: true });
    expect(calls("POST", "/uploads")).toHaveLength(1);
    expect(calls("POST", "/uploads")[0]![1]!.body).toBeInstanceOf(FormData);
    expect(screen.getByTestId("avatar-photo").props.source.uri).toMatch(/photos\/new\.jpg$/);
  });

  it("holds the form's Save while the photo is on its way", async () => {
    chosen();
    let arrive: (body: unknown) => void = () => undefined;
    serve({ "POST /uploads": () => new Promise((done) => (arrive = done)) });
    await show(<Form />);
    await fireEvent.press(screen.getByTestId("photo-choose"));
    await waitFor(() => expect(screen.getByTestId("photo-choose")).toHaveTextContent("Uploading…"));
    expect(screen.getByTestId("photo-choose")).toBeDisabled();
    expect(screen.getByTestId("save")).toBeDisabled();
    await act(async () => arrive(KEPT));
    await waitFor(() => expect(screen.getByTestId("save")).toBeEnabled());
    expect(screen.getByTestId("photo-choose")).toHaveTextContent("Choose photo");
  });

  it("takes the photo off", async () => {
    serve({});
    await show(<Form first="/api/v1/files/photos/old.jpg" />);
    expect(screen.getByTestId("avatar-photo")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("photo-remove"));
    expect(screen.getByTestId("save")).toHaveTextContent("no photo");
    expect(screen.getByText("AR")).toBeOnTheScreen();
    expect(screen.queryByTestId("photo-remove")).toBeNull();
  });

  it("says why the phone gave no photo, and sends nothing", async () => {
    mockChoosePhoto.mockResolvedValue({ kind: "refused", reason: "wrongType" });
    serve({});
    await show(<Form first="/api/v1/files/photos/old.jpg" />);
    await fireEvent.press(screen.getByTestId("photo-choose"));
    expect(await screen.findByTestId("photo-problem")).toHaveTextContent(
      /^This kind of file cannot be sent\./,
    );
    expect(calls("POST", "/uploads")).toHaveLength(0);
    // The photo that was there stays.
    expect(screen.getByTestId("save")).toHaveTextContent("/api/v1/files/photos/old.jpg");
  });

  it("does nothing when the person closes the library without choosing", async () => {
    mockChoosePhoto.mockResolvedValue({ kind: "none" });
    serve({});
    await show(<Form />);
    await fireEvent.press(screen.getByTestId("photo-choose"));
    await waitFor(() => expect(mockChoosePhoto).toHaveBeenCalled());
    expect(screen.queryByTestId("photo-problem")).toBeNull();
    expect(calls("POST", "/uploads")).toHaveLength(0);
  });

  it("gives the server's reason when it does not take the photo", async () => {
    chosen();
    serve({
      "POST /uploads": answer(400, {
        error: {
          code: "VALIDATION",
          message: "errors.validation",
          fields: { file: ["validation.fileSize"] },
        },
      }),
    });
    await show(<Form />);
    await fireEvent.press(screen.getByTestId("photo-choose"));
    expect(await screen.findByTestId("photo-problem")).toHaveTextContent(
      "The image must be 2 MB or smaller.",
    );
    expect(screen.getByTestId("save")).toHaveTextContent("no photo");
    expect(screen.getByTestId("save")).toBeEnabled();
  });
});

function teacher(change: Partial<TeacherDetail> = {}): TeacherDetail {
  return {
    id: "t1",
    fullName: "Aziz Rahimov",
    phone: "+998901112233",
    gender: "MALE",
    birthDate: "1990-04-12",
    hireDate: "2024-09-01",
    photoUrl: null,
    salaryMethod: "PERCENT",
    fixedSalary: null,
    percentShare: 40,
    perLessonFee: null,
    perStudentFee: null,
    isArchived: false,
    createdAt: "2024-09-01T05:00:00.000Z",
    roles: [{ code: "TEACHER", name: "Teacher" }],
    branches: [{ id: "b1", name: "Chilonzor" }],
    signInCode: "OFF",
    telegramLinked: false,
    mustChangePassword: false,
    groupNames: [],
    ...change,
  } as TeacherDetail;
}

function student(change: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: "s1",
    fullName: "Ali Valiyev",
    phone: "+998901112233",
    note: null,
    isArchived: false,
    isBlacklisted: false,
    gradeAverage: null,
    balance: 0,
    groups: [],
    birthDate: null,
    schoolName: null,
    parents: [],
    customFields: [],
    ...change,
  } as StudentDetail;
}

/** The student form the way a page shows it: closed at first, opened by a press. */
function StudentPage({ who }: { who: StudentDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button label="Edit" onPress={() => setOpen(true)} testID="open" />
      <StudentFormSheet open={open} onClose={() => setOpen(false)} student={who} />
    </>
  );
}

describe("a photo in the staff form", () => {
  it("goes with a new teacher", async () => {
    chosen();
    serve({ "POST /uploads": KEPT, "POST /teachers": teacher({ id: "t7" }) });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" />);
    await fireEvent.press(screen.getByTestId("teacher-photo-choose"));
    await waitFor(() => expect(screen.getByTestId("teacher-photo-remove")).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId("teacher-name"), "Jasur Aliyev");
    await fireEvent.changeText(screen.getByTestId("teacher-phone"), "+998901234567");
    await fireEvent.changeText(screen.getByTestId("teacher-amount"), "40");
    await fireEvent.press(screen.getByTestId("teacher-save"));
    await waitFor(() => expect(calls("POST", "/teachers")).toHaveLength(1));
    expect(sentBody(calls("POST", "/teachers")[0]![1])).toMatchObject({
      fullName: "Jasur Aliyev",
      photoUrl: KEPT.url,
    });
  });

  it("keeps the photo a person has through a change, and sends none once it is taken off", async () => {
    const person = teacher({ photoUrl: "/api/v1/files/photos/old.jpg" });
    serve({ "PATCH /teachers/t1": person });
    await show(<TeacherFormSheet open onClose={jest.fn()} kind="teachers" person={person} />);
    expect(screen.getByTestId("avatar-photo").props.source.uri).toMatch(/photos\/old\.jpg$/);
    await fireEvent.press(screen.getByTestId("teacher-save"));
    await waitFor(() => expect(calls("PATCH", "/teachers/t1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/teachers/t1")[0]![1])).toMatchObject({
      photoUrl: "/api/v1/files/photos/old.jpg",
    });
    await settled();
    await fireEvent.press(screen.getByTestId("teacher-photo-remove"));
    await fireEvent.press(screen.getByTestId("teacher-save"));
    await waitFor(() => expect(calls("PATCH", "/teachers/t1")).toHaveLength(2));
    expect(sentBody(calls("PATCH", "/teachers/t1")[1]![1])).toMatchObject({ photoUrl: null });
  });
});

describe("a photo in the student form", () => {
  it("shows the student's photo and saves a new one", async () => {
    chosen();
    const who = student({ photoUrl: "/api/v1/files/photos/old.jpg" });
    serve({ "POST /uploads": KEPT, "PATCH /students/s1": who });
    await show(<StudentPage who={who} />);
    await fireEvent.press(screen.getByTestId("open"));
    await screen.findByTestId("student-name");
    expect(screen.getByTestId("avatar-photo").props.source.uri).toMatch(/photos\/old\.jpg$/);
    await fireEvent.press(screen.getByTestId("student-photo-choose"));
    await waitFor(() =>
      expect(screen.getByTestId("avatar-photo").props.source.uri).toMatch(/photos\/new\.jpg$/),
    );
    await fireEvent.press(screen.getByTestId("student-save"));
    await waitFor(() => expect(calls("PATCH", "/students/s1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/students/s1")[0]![1])).toMatchObject({ photoUrl: KEPT.url });
  });

  it("takes a student's photo off", async () => {
    const who = student({ photoUrl: "/api/v1/files/photos/old.jpg" });
    serve({ "PATCH /students/s1": student() });
    await show(<StudentPage who={who} />);
    await fireEvent.press(screen.getByTestId("open"));
    await fireEvent.press(await screen.findByTestId("student-photo-remove"));
    await fireEvent.press(screen.getByTestId("student-save"));
    await waitFor(() => expect(calls("PATCH", "/students/s1")).toHaveLength(1));
    expect(sentBody(calls("PATCH", "/students/s1")[0]![1])).toMatchObject({ photoUrl: null });
  });
});
