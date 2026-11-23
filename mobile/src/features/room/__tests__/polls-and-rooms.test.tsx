import { act, fireEvent, screen } from "@testing-library/react-native";

import { fakeEngine, openPanel, peer, renderRoom } from "@/features/room/test-support";
import type { PollDto } from "@kampus/lib/video/dto";

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
 * The teacher's polls and breakout rooms in the app (A-211), over a stand-in
 * for the call engine: what each button asks the engine to do, and what a
 * student sees of a poll.
 */

function poll(change: Partial<PollDto> = {}): PollDto {
  return {
    id: "p1",
    question: "Which tense?",
    options: ["Past simple", "Present perfect"],
    open: true,
    myVote: null,
    counts: null,
    total: 0,
    voters: null,
    ...change,
  };
}

async function openTool(tool: "tool-poll" | "tool-breakout") {
  await openPanel("open-tools");
  await fireEvent.press(screen.getByTestId(tool));
  await screen.findByTestId("room-sheet");
}

describe("a poll from the app", () => {
  it("asks everyone the teacher's question with the answers that were filled in", async () => {
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine);
    await openTool("tool-poll");
    await screen.findByTestId("poll-form");
    // Nothing to ask yet.
    expect(screen.getByTestId("poll-ask")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("poll-question-input"), "  Which tense?  ");
    await fireEvent.changeText(screen.getByTestId("poll-option-input-0"), "Past simple");
    expect(screen.getByTestId("poll-ask")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("poll-add-option"));
    await fireEvent.changeText(screen.getByTestId("poll-option-input-2"), "Present perfect ");
    await fireEvent.press(screen.getByTestId("poll-ask"));
    // The empty second answer is left out.
    expect(engine.openPoll).toHaveBeenCalledWith("Which tense?", [
      "Past simple",
      "Present perfect",
    ]);
  });

  it("offers no more than six answers and no fewer than two", async () => {
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    await renderRoom(engine);
    await openTool("tool-poll");
    expect(screen.queryByTestId("poll-remove-option-0")).toBeNull();
    for (let i = 0; i < 4; i += 1) await fireEvent.press(screen.getByTestId("poll-add-option"));
    expect(screen.getByTestId("poll-option-input-5")).toBeTruthy();
    expect(screen.queryByTestId("poll-add-option")).toBeNull();
    await fireEvent.press(screen.getByTestId("poll-remove-option-5"));
    expect(screen.queryByTestId("poll-option-input-5")).toBeNull();
  });

  it("shows the teacher the answers as they come in, with names, and closes the poll", async () => {
    const engine = fakeEngine("HOST", [peer("s", "Demo Student")]);
    engine.poll = poll({
      counts: [2, 1],
      total: 3,
      voters: [
        { name: "Ali", option: 0 },
        { name: "Vali", option: 0 },
        { name: "Sara", option: 1 },
      ],
    });
    await renderRoom(engine);
    await openTool("tool-poll");
    await screen.findByTestId("poll-panel");
    expect(screen.getByTestId("poll-question")).toHaveTextContent("Which tense?");
    expect(screen.getByTestId("poll-result-0")).toHaveTextContent(/Past simple\s*2/);
    expect(screen.getByTestId("poll-total")).toHaveTextContent("3 answers");
    expect(screen.getByTestId("poll-voters")).toHaveTextContent(/Past simple:\s+Ali, Vali/);
    await fireEvent.press(screen.getByTestId("poll-close"));
    expect(engine.closePoll).toHaveBeenCalled();
    // A new question can follow at once.
    await fireEvent.press(screen.getByTestId("poll-new"));
    expect(await screen.findByTestId("poll-form")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("poll-cancel"));
    expect(await screen.findByTestId("poll-panel")).toBeTruthy();
  });

  it("lets a student answer, and change the answer while the poll is open", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.poll = poll();
    await renderRoom(engine);
    await screen.findByTestId("poll-card");
    expect(screen.getByTestId("poll-hint")).toHaveTextContent(/Tap an answer/);
    await fireEvent.press(screen.getByTestId("poll-option-1"));
    expect(engine.votePoll).toHaveBeenCalledWith(1);
    await act(async () => {
      engine.change(() => {
        engine.poll = poll({ myVote: 1 });
      });
    });
    expect(screen.getByTestId("poll-hint")).toHaveTextContent(/You can change it/);
  });

  it("shows a student the result once the poll is closed, until they put it away", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.poll = poll({ open: false, myVote: 0, counts: [3, 1], total: 4 });
    await renderRoom(engine);
    await screen.findByTestId("poll-result-card");
    expect(screen.getByTestId("poll-result-0")).toHaveTextContent(/Past simple\s*3/);
    expect(screen.queryByTestId("poll-option-0")).toBeNull();
    await fireEvent.press(screen.getByTestId("poll-result-close"));
    expect(engine.markPollSeen).toHaveBeenCalled();
    await act(async () => {
      engine.change(() => {
        engine.pollUnseen = false;
      });
    });
    expect(screen.queryByTestId("poll-result-card")).toBeNull();
  });
});

describe("breakout rooms from the app", () => {
  const people = [
    { id: "me", displayName: "Demo Teacher", role: "HOST" as const, room: null },
    { id: "a", displayName: "Ali", role: "STUDENT" as const, room: null },
    { id: "b", displayName: "Vali", role: "STUDENT" as const, room: null },
    { id: "c", displayName: "Sara", role: "STUDENT" as const, room: null },
    { id: "g", displayName: "Guest", role: "STAFF" as const, room: null },
  ];

  it("seats the students round the rooms in turn and leaves guests with the teacher", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Ali")]);
    engine.breakout = { rooms: 0, endsAt: null, mine: null, everyone: people };
    await renderRoom(engine);
    await openTool("tool-breakout");
    await screen.findByTestId("breakout-panel");
    await fireEvent.press(screen.getByTestId("breakout-rooms-2"));
    await fireEvent.press(screen.getByTestId("breakout-minutes-15"));
    await fireEvent.press(screen.getByTestId("breakout-start"));
    expect(engine.startBreakout).toHaveBeenCalledWith(2, 15, [
      { id: "a", room: 1 },
      { id: "b", room: 2 },
      { id: "c", room: 1 },
    ]);
  });

  it("can leave the rooms open until the teacher closes them", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Ali")]);
    engine.breakout = { rooms: 0, endsAt: null, mine: null, everyone: people };
    await renderRoom(engine);
    await openTool("tool-breakout");
    await fireEvent.press(await screen.findByTestId("breakout-rooms-3"));
    await fireEvent.press(screen.getByTestId("breakout-minutes-none"));
    await fireEvent.press(screen.getByTestId("breakout-start"));
    expect(engine.startBreakout).toHaveBeenCalledWith(3, null, expect.any(Array));
  });

  it("does not open rooms with no students in the lesson", async () => {
    const engine = fakeEngine("HOST", []);
    engine.breakout = { rooms: 0, endsAt: null, mine: null, everyone: [people[0]!] };
    await renderRoom(engine);
    await openTool("tool-breakout");
    expect(await screen.findByTestId("breakout-no-students")).toBeTruthy();
    expect(screen.getByTestId("breakout-start")).toBeDisabled();
  });

  it("moves a person, visits a room, writes to everyone and brings everyone back", async () => {
    const engine = fakeEngine("HOST", [peer("g", "Guest", { role: "STAFF" })]);
    engine.breakout = {
      rooms: 2,
      endsAt: null,
      mine: null,
      everyone: [
        people[0]!,
        { ...people[1]!, room: 1 },
        { ...people[2]!, room: 2 },
        { ...people[3]!, room: 1 },
        people[4]!,
      ],
    };
    await renderRoom(engine);
    await openTool("tool-breakout");
    await screen.findByTestId("breakout-list");
    expect(screen.getByTestId("breakout-room-0")).toHaveTextContent(/Main room\s*2.*you are here/);
    expect(screen.getByTestId("breakout-room-1")).toHaveTextContent(/Room 1\s*2/);

    // Ali from room 1 to room 2.
    await fireEvent.press(screen.getByTestId("breakout-member-a"));
    await fireEvent.press(await screen.findByTestId("breakout-move-a-2"));
    expect(engine.moveToRoom).toHaveBeenCalledWith("a", 2);

    await fireEvent.press(screen.getByTestId("breakout-visit-1"));
    expect(engine.moveToRoom).toHaveBeenCalledWith("me", 1);

    await fireEvent.changeText(screen.getByTestId("breakout-notice"), "Two minutes left");
    await fireEvent.press(screen.getByTestId("breakout-notice-send"));
    expect(engine.sendNotice).toHaveBeenCalledWith("Two minutes left");

    await fireEvent.press(screen.getByTestId("breakout-end"));
    expect(engine.endBreakout).toHaveBeenCalled();
  });

  it("counts down the time the rooms have left", async () => {
    const engine = fakeEngine("STUDENT", [peer("a", "Ali")]);
    engine.breakout = {
      rooms: 2,
      endsAt: new Date(Date.now() + 5 * 60_000 + 400).toISOString(),
      mine: 1,
      everyone: null,
    };
    await renderRoom(engine);
    await screen.findByTestId("call-room");
    expect(screen.getByText(/You are in room 1\..* 5:00/)).toBeTruthy();
  });
});
