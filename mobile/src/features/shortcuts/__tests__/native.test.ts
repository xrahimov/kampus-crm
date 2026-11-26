import * as AppIntents from "expo-app-intents";

import { shortcutNote } from "../../../../modules/kampus-call";
import { donate, forgetDonations, saveNote } from "../native";
import type { ShortcutSnapshot } from "../snapshot";

jest.mock("../../../../modules/kampus-call", () => ({ shortcutNote: { save: jest.fn() } }));

/*
 * The note on its way to the phone (A-273): one text for Android, three lists
 * for the iPhone, and the order they are written in.
 */

const intents = jest.mocked(AppIntents);
const save = jest.mocked(shortcutNote.save);

const NOTE: ShortcutSnapshot = {
  kind: "staff",
  savedAt: 1_795_000_000_000,
  toCheck: 3,
  lessons: [
    {
      id: "l1",
      title: "English A1",
      place: "Room 3",
      startsAt: 1_795_000_600_000,
      endsAt: 1_795_006_000_000,
      live: true,
    },
    {
      id: "l2",
      title: "SAT",
      place: null,
      startsAt: 1_795_010_000_000,
      endsAt: 1_795_013_600_000,
      live: false,
    },
  ],
  homework: [
    { id: "h1", title: "Essay", due: "2026-11-28" },
    { id: "h2", title: "Words", due: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  intents.isAvailable.mockReturnValue(true);
});

describe("handing the note to the phone", () => {
  it("writes the lists first and who they belong to last", async () => {
    await saveNote(NOTE, "ru");
    expect(intents.setEntityCatalogAsync.mock.calls.map(([kind]) => kind)).toEqual([
      "lesson",
      "homework",
      "who",
    ]);
    const [lessons, homework, who] = intents.setEntityCatalogAsync.mock.calls.map(
      ([, list]) => list,
    );
    expect(lessons).toEqual([
      {
        id: "l1",
        title: "English A1",
        subtitle: "Room 3",
        metadata: { startsAt: "1795000600000", endsAt: "1795006000000", live: "1" },
      },
      {
        id: "l2",
        title: "SAT",
        metadata: { startsAt: "1795010000000", endsAt: "1795013600000", live: "0" },
      },
    ]);
    expect(homework).toEqual([
      { id: "h1", title: "Essay", metadata: { due: "2026-11-28" } },
      { id: "h2", title: "Words" },
    ]);
    expect(who).toEqual([
      {
        id: "staff",
        title: "staff",
        metadata: { savedAt: "1795000000000", locale: "ru", toCheck: "3" },
      },
    ]);
  });

  it("gives Android the same note as one text, with the language to answer in", async () => {
    await saveNote(NOTE, "uz");
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(save.mock.calls[0]?.[0] ?? "null")).toEqual({ ...NOTE, locale: "uz" });
  });

  it("wipes who it was first, then the lists, when nobody is signed in", async () => {
    await saveNote(null, "en");
    expect(save).toHaveBeenCalledWith(null);
    expect(intents.setEntityCatalogAsync.mock.calls).toEqual([
      ["who", []],
      ["lesson", []],
      ["homework", []],
    ]);
  });

  it("keeps writing the other lists when one is refused", async () => {
    intents.setEntityCatalogAsync.mockRejectedValueOnce(new Error("no room"));
    await expect(saveNote(NOTE, "en")).resolves.toBeUndefined();
    expect(intents.setEntityCatalogAsync).toHaveBeenCalledTimes(3);
  });

  it("does nothing for Siri where there is no Siri", async () => {
    intents.isAvailable.mockReturnValue(false);
    await saveNote(NOTE, "en");
    donate("homework");
    forgetDonations();
    expect(save).toHaveBeenCalledTimes(1);
    expect(intents.setEntityCatalogAsync).not.toHaveBeenCalled();
    expect(intents.donateIntentAsync).not.toHaveBeenCalled();
    expect(intents.deleteDonationsAsync).not.toHaveBeenCalled();
  });
});

describe("what the iPhone learns from", () => {
  it("is told when a person does by hand what a shortcut does", () => {
    donate("startLesson");
    expect(intents.donateIntentAsync).toHaveBeenCalledWith("startLesson");
  });

  it("forgets all three at sign-out", () => {
    forgetDonations();
    expect(intents.deleteDonationsAsync.mock.calls).toEqual([
      [{ intent: "nextLesson" }],
      [{ intent: "startLesson" }],
      [{ intent: "homework" }],
    ]);
  });
});
