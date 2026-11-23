import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import uz from "../../messages/uz.json";
import { historyActionKey } from "@/lib/group-history";

/** Every action written to the audit log with `entity: "Group"`. */
const RECORDED = [
  "group.archive",
  "group.changeTeacher",
  "group.create",
  "group.dayOff",
  "group.dayOffRemove",
  "group.finish",
  "group.moveBranch",
  "group.note",
  "group.supportTeachers",
  "group.update",
  "lesson.studentBook",
  "lesson.studentCancel",
  "lesson.studentMove",
  "lesson.studentRebook",
  "stream.delete",
  "stream.post",
  "stream.update",
  "topic.release",
  "waitlist.offer",
];

describe("the name of a group's history entry", () => {
  const actions = en.groups.history.actions as Record<string, string>;
  const has = (key: string) => key in actions;

  it("names a change to the group by its second word", () => {
    expect(historyActionKey("group.finish", has)).toBe("finish");
    expect(historyActionKey("group.update", has)).toBe("update");
  });

  it("does not call a changed stream post an edited group", () => {
    expect(historyActionKey("stream.update", has)).toBe("streamUpdate");
    expect(actions.streamUpdate).not.toBe(actions.update);
    expect(historyActionKey("stream.post", has)).toBe("post");
    expect(historyActionKey("topic.release", has)).toBe("release");
  });

  it("falls back to Edited for something it has no word for", () => {
    expect(historyActionKey("group.somethingNew", has)).toBe("update");
    expect(historyActionKey("odd", has)).toBe("update");
  });

  it("has a word of its own, in every language, for each recorded action", () => {
    for (const messages of [en, ru, uz]) {
      const words = messages.groups.history.actions as Record<string, string>;
      for (const action of RECORDED) {
        const key = historyActionKey(action, (k) => k in words);
        expect(words[key], action).toBeTruthy();
        if (action !== "group.update") expect(key, action).not.toBe("update");
      }
    }
  });
});
