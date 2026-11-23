import { describe, expect, it } from "vitest";

import type { StageDto } from "@/lib/video/dto";
import {
  BOARD,
  breakoutCountdown,
  MATERIAL,
  roomView,
  SELF,
  type RoomViewPeer,
} from "@/lib/video/room-view";

/* Who is on the stage of a lesson room: the rules the site and the phone app share (A-207). */

const stage = (change: Partial<StageDto> = {}): StageDto => ({
  spotlight: null,
  focus: false,
  board: false,
  material: null,
  ...change,
});

const peer = (id: string, change: Partial<RoomViewPeer> = {}): RoomViewPeer => ({
  id,
  displayName: id,
  role: "STUDENT",
  joinedAt: "2026-11-23T05:00:00.000Z",
  media: { audio: true, video: true, screen: false, hand: false },
  handRaisedAt: null,
  ...change,
});

const teacher = { participantId: "t", displayName: "Teacher", role: "HOST" as const };
const student = { participantId: "s", displayName: "Student", role: "STUDENT" as const };
const quiet = { screen: false, hand: false };

describe("the stage of a lesson room", () => {
  it("shows a teacher everyone the same size while nobody leads", () => {
    const view = roomView({
      self: teacher,
      peers: [peer("a"), peer("b")],
      media: quiet,
      stage: stage(),
      pinned: null,
      handRaisedAt: null,
    });
    expect(view.stageKey).toBeNull();
    expect(view.hidden.size).toBe(0);
  });

  it("puts the teacher on a student's stage", () => {
    const view = roomView({
      self: student,
      peers: [peer("t", { role: "HOST" }), peer("a")],
      media: quiet,
      stage: stage(),
      pinned: null,
      handRaisedAt: null,
    });
    expect(view.host).toBe("t");
    expect(view.stageKey).toBe("t");
  });

  it("lets a shared screen win over the teacher's spotlight, and the viewer's own choice over both", () => {
    const peers = [
      peer("t", { role: "HOST" }),
      peer("a", { media: { audio: true, video: true, screen: true } }),
      peer("b"),
    ];
    const base = {
      self: student,
      peers,
      media: quiet,
      stage: stage({ spotlight: "b" }),
      handRaisedAt: null,
    };
    expect(roomView({ ...base, pinned: null }).stageKey).toBe("a");
    expect(roomView({ ...base, pinned: "b" }).stageKey).toBe("b");
    // Someone who left cannot stay chosen.
    expect(roomView({ ...base, pinned: "gone" }).stageKey).toBe("a");
  });

  it("knows this person's own screen and spotlight by the tile's own name", () => {
    const view = roomView({
      self: teacher,
      peers: [peer("a")],
      media: { screen: true, hand: false },
      stage: stage({ spotlight: "t" }),
      pinned: null,
      handRaisedAt: null,
    });
    expect(view.sharer).toBe(SELF);
    expect(view.spotlightId).toBe(SELF);
    expect(view.stageKey).toBe(SELF);
  });

  it("hides the other students from a student in focus mode, but not from the teacher", () => {
    const peers = [peer("t", { role: "HOST" }), peer("a"), peer("b")];
    const forStudent = roomView({
      self: student,
      peers,
      media: quiet,
      stage: stage({ focus: true, spotlight: "b" }),
      pinned: "a",
      handRaisedAt: null,
    });
    expect([...forStudent.hidden]).toEqual(["a"]);
    // A hidden classmate cannot be chosen either: the spotlight leads.
    expect(forStudent.stageKey).toBe("b");
    const forTeacher = roomView({
      self: teacher,
      peers: [peer("a"), peer("b")],
      media: quiet,
      stage: stage({ focus: true }),
      pinned: null,
      handRaisedAt: null,
    });
    expect(forTeacher.hidden.size).toBe(0);
  });

  it("gives the stage to a shown file, and to the whiteboard when the file cannot be drawn on", () => {
    const base = {
      self: student,
      peers: [peer("t", { role: "HOST" })],
      media: quiet,
      pinned: null,
      handRaisedAt: null,
    };
    const material = (view: "pdf" | "video") => ({
      id: "m",
      title: "Unit 3",
      kind: "FILE" as const,
      view,
      url: "/x",
      page: 1,
      playing: false,
      position: 0,
      at: "2026-11-23T05:00:00.000Z",
    });
    expect(roomView({ ...base, stage: stage({ board: true }) }).stageKey).toBe(BOARD);
    expect(roomView({ ...base, stage: stage({ material: material("pdf") }) }).stageKey).toBe(
      MATERIAL,
    );
    // The pen draws over a page; over a video the whiteboard covers it.
    expect(
      roomView({ ...base, stage: stage({ board: true, material: material("pdf") }) }).stageKey,
    ).toBe(MATERIAL);
    expect(
      roomView({ ...base, stage: stage({ board: true, material: material("video") }) }).stageKey,
    ).toBe(BOARD);
  });

  it("queues raised hands in the order they went up, this person's own among them", () => {
    const view = roomView({
      self: student,
      peers: [
        peer("a", {
          media: { audio: true, video: true, screen: false, hand: true },
          handRaisedAt: "2026-11-23T05:10:00.000Z",
        }),
        peer("b", {
          media: { audio: true, video: true, screen: false, hand: true },
          handRaisedAt: "2026-11-23T05:02:00.000Z",
        }),
        peer("c"),
      ],
      media: { screen: false, hand: true },
      stage: stage(),
      pinned: null,
      handRaisedAt: "2026-11-23T05:05:00.000Z",
    });
    expect(view.handQueue.map((h) => h.id)).toEqual(["b", SELF, "a"]);
  });
});

describe("the countdown of breakout rooms", () => {
  const now = new Date("2026-11-23T10:00:00Z").getTime();

  it("reads as minutes and seconds", () => {
    expect(breakoutCountdown("2026-11-23T10:04:05Z", now)).toBe("4:05");
    expect(breakoutCountdown("2026-11-23T10:00:09Z", now)).toBe("0:09");
  });

  it("stops at zero once the time has passed", () => {
    expect(breakoutCountdown("2026-11-23T09:59:00Z", now)).toBe("0:00");
  });

  it("is nothing for rooms the teacher closes by hand", () => {
    expect(breakoutCountdown(null, now)).toBeNull();
  });
});
