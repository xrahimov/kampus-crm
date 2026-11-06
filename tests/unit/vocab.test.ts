/**
 * Vocabulary trainer (A-165) against the real database: the word list, the
 * flashcards of open topics, Leitner boxes, the day streak and its coins.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { parseWordLines, wordLines } from "@/lib/validation/vocab";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { setCourseSyllabus } from "@/server/services/settings/syllabus.service";
import { setTopicRelease } from "@/server/services/settings/topic-content.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";
import { vocabStreak } from "@/server/services/vocab/streak";
import {
  getPortalVocab,
  listTopicWords,
  reviewPortalWord,
  setTopicWords,
} from "@/server/services/vocab/vocab.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `vc${RUN}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const teacher: Actor = {
  ...ceo,
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};
const stranger: Actor = { ...teacher, fullName: "Elsewhere" };

let groupId: string;
let membershipId: string;
let topics: Array<{ id: string }> = [];
let anna: { token: string };

beforeAll(async () => {
  const [user, teacherUser] = await Promise.all(
    ["CEO", "Teacher"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99891${RUN}6${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = user!.id;
  teacher.userId = teacherUser!.id;
  stranger.userId = teacherUser!.id;
  const branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  teacher.activeBranchId = branchId;
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:00",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
      startDate: iso(new Date()),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const s = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Anna`,
    phone: `+99891${RUN}71`,
    birthDate: null,
    gender: "FEMALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: {
      groupId,
      joinedAt: iso(new Date()),
      customPrice: null,
      note: null,
      status: "ACTIVE",
    },
  });
  const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === s.id)!;
  anna = { token: link.token };
  membershipId = link.membershipId;
  topics = await setCourseSyllabus(ceo, courseId, {
    topics: [{ title: "Fruit" }, { title: "Colours" }],
  });
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("vocabulary trainer (A-165)", () => {
  it("parses word lines both ways", () => {
    expect(
      parseWordLines("apple — olma — I eat an apple.\nplum - olxo'ri\n\nbanana\tbanan"),
    ).toEqual([
      { term: "apple", translation: "olma", example: "I eat an apple." },
      { term: "plum", translation: "olxo'ri", example: null },
      { term: "banana", translation: "banan", example: null },
    ]);
    expect(wordLines([{ term: "a", translation: "b", example: null }])).toBe("a — b");
  });

  it("keeps a word's row when its term stays, and opens words with the topic", async () => {
    const saved = await setTopicWords(teacher, topics[0]!.id, {
      words: [
        { term: "apple", translation: "olma", example: "An apple a day." },
        { term: "pear", translation: "nok" },
        { term: "plum", translation: "olxo'ri" },
      ],
    });
    expect(saved.words.map((w) => w.term)).toEqual(["apple", "pear", "plum"]);
    const appleId = saved.words[0]!.id;
    await expect(setTopicWords(stranger, topics[0]!.id, { words: [] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const edited = await setTopicWords(teacher, topics[0]!.id, {
      words: [
        { term: "Apple", translation: "olma (meva)" },
        { term: "grape", translation: "uzum" },
      ],
    });
    expect(edited.words.map((w) => [w.id === appleId, w.term, w.translation])).toEqual([
      [true, "Apple", "olma (meva)"],
      [false, "grape", "uzum"],
    ]);
    expect((await listTopicWords(ceo, topics[0]!.id)).words).toHaveLength(2);

    // Nothing is due while the topic is locked; opening it brings the words.
    let mine = (await getPortalVocab(anna.token))!;
    expect(mine).toMatchObject({ total: 0, due: 0, cards: [] });
    await setTopicRelease(teacher, groupId, topics[0]!.id, { mode: "now", date: null });
    mine = (await getPortalVocab(anna.token))!;
    expect(mine).toMatchObject({ total: 2, learned: 0, due: 2, streak: 0, todayReviewed: 0 });
    expect(mine.cards.map((c) => [c.term, c.box, c.topicTitle])).toEqual([
      ["Apple", 0, "Fruit"],
      ["grape", 0, "Fruit"],
    ]);
  });

  it("moves a known word up a box and a missed one back, counts the day and the streak", async () => {
    const before = (await getPortalVocab(anna.token))!;
    const [apple, grape] = before.cards;
    let after = (await reviewPortalWord(anna.token, apple!.id, { known: true }))!;
    expect(after).toMatchObject({ due: 1, todayReviewed: 1, streak: 1 });
    expect(after.cards.map((c) => c.term)).toEqual(["grape"]);
    after = (await reviewPortalWord(anna.token, grape!.id, { known: false }))!;
    // A missed word is due again in ten minutes, so the queue is empty for now.
    expect(after).toMatchObject({ due: 0, todayReviewed: 2 });
    const cards = await prisma.vocabCard.findMany({
      where: { membershipId },
      orderBy: { box: "desc" },
    });
    expect(cards.map((c) => [c.box, c.reviews, c.correct])).toEqual([
      [1, 1, 1],
      [0, 1, 0],
    ]);
    expect(cards[0]!.dueAt.getTime()).toBeGreaterThan(Date.now() + 20 * 3600 * 1000);
    await expect(reviewPortalWord(anna.token, "not-a-word", { known: true })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );

    // Six earlier days of practice make today the seventh: the streak coins are awarded.
    const days = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      days.push({ membershipId, date: new Date(`${iso(d)}T00:00:00Z`), reviewed: 1, correct: 1 });
    }
    await prisma.vocabDay.createMany({ data: days });
    expect(await vocabStreak(prisma, membershipId)).toBe(7);
    // Four learned boxes later the card counts as learned.
    await prisma.vocabCard.update({ where: { id: cards[0]!.id }, data: { dueAt: new Date(0) } });
    after = (await reviewPortalWord(anna.token, apple!.id, { known: true }))!;
    expect(after.streak).toBe(7);
    // The coins follow the centre's automatic-coins switch (off in the seed, on once the office turns it on).
    const [coins, settings] = await Promise.all([
      prisma.coinTransaction.findFirst({
        where: { refKey: { startsWith: `vocab:${membershipId}:` } },
      }),
      prisma.orgSettings.findUnique({ where: { organizationId: DEMO_ORG_ID } }),
    ]);
    expect(coins?.event ?? null).toBe(settings?.autoCoins ? "VOCAB_STREAK" : null);
  });
});
