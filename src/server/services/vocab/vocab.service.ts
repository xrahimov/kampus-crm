import {
  VOCAB_INTERVALS_DAYS,
  VOCAB_LEARNED_BOX,
  VOCAB_STREAK_DAYS,
  type VocabReviewInput,
  type VocabWordsInput,
} from "@/lib/validation/vocab";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { checkBadges } from "@/server/services/badges/badges.service";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import { today } from "@/server/services/groups/shared";
import {
  canEditTopicContent,
  releaseOf,
  topicOpen,
} from "@/server/services/settings/topic-content.service";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

import { localDay, vocabStreak } from "./streak";

/**
 * Vocabulary trainer (A-165, online-lessons item C5): word lists per syllabus
 * topic, flashcards with spaced repetition (Leitner boxes 0-5) on the
 * student's page, a practice streak that earns coins and a badge.
 */

export interface VocabWordDto {
  id: string;
  term: string;
  translation: string;
  example: string | null;
}

export interface TopicWordsDto {
  topicId: string;
  title: string;
  canEdit: boolean;
  words: VocabWordDto[];
}

export interface PortalVocabCardDto extends VocabWordDto {
  topicTitle: string;
  box: number;
}

export interface PortalVocabDto {
  /** Words of the topics open to the student. */
  total: number;
  learned: number;
  /** Due now, including words never seen. */
  due: number;
  /** Days in a row practised, counting today or yesterday as the last day. */
  streak: number;
  todayReviewed: number;
  /** The next cards to practise, due first then new, at most 20. */
  cards: PortalVocabCardDto[];
}

const SESSION = 20;

const toDto = (w: { id: string; term: string; translation: string; example: string | null }) => ({
  id: w.id,
  term: w.term,
  translation: w.translation,
  example: w.example,
});

async function topicInScope(db: DbClient, actor: Actor, topicId: string) {
  const topic = await mustFind(
    db.courseTopic.findUnique({
      where: { id: topicId },
      select: { id: true, title: true, course: { select: { id: true, branchId: true } } },
    }),
  );
  if (!actor.branchIds.includes(topic.course.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  return topic;
}

/* ----- staff ------------------------------------------------------------------------------ */

export async function listTopicWords(
  actor: Actor,
  topicId: string,
  db: DbClient = prisma,
): Promise<TopicWordsDto> {
  authorize(actor, "groups.view");
  const topic = await topicInScope(db, actor, topicId);
  const [words, canEdit] = await Promise.all([
    db.vocabWord.findMany({ where: { topicId }, orderBy: { sortOrder: "asc" } }),
    canEditTopicContent(db, actor, topic.course.id),
  ]);
  return { topicId, title: topic.title, canEdit, words: words.map(toDto) };
}

/**
 * Replaces the topic's word list. Words whose term stays keep their row, so
 * students' flashcards survive an edit of the translation or example.
 */
export async function setTopicWords(
  actor: Actor,
  topicId: string,
  input: VocabWordsInput,
  db: DbClient = prisma,
): Promise<TopicWordsDto> {
  const topic = await topicInScope(db, actor, topicId);
  if (!(await canEditTopicContent(db, actor, topic.course.id))) {
    throw AppError.forbidden();
  }
  const seen = new Set<string>();
  const words = input.words.filter((w) => {
    const key = w.term.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await db.$transaction(async (tx) => {
    const existing = await tx.vocabWord.findMany({ where: { topicId } });
    const byTerm = new Map(existing.map((w) => [w.term.toLocaleLowerCase(), w]));
    const keep = new Set<string>();
    for (const [i, w] of words.entries()) {
      const row = byTerm.get(w.term.toLocaleLowerCase());
      const data = {
        term: w.term,
        translation: w.translation,
        example: w.example ?? null,
        sortOrder: i,
      };
      if (row) {
        keep.add(row.id);
        await tx.vocabWord.update({ where: { id: row.id }, data });
      } else {
        const created = await tx.vocabWord.create({
          data: { topicId, ...data },
          select: { id: true },
        });
        keep.add(created.id);
      }
    }
    await tx.vocabWord.deleteMany({
      where: { topicId, id: { notIn: [...keep] } },
    });
    await recordAudit(tx, actor, {
      action: "topic.words",
      entity: "CourseTopic",
      entityId: topicId,
      before: { words: existing.length },
      after: { words: words.length },
    });
  });
  return listTopicWords(actor, topicId, db);
}

/* ----- the student's page ----------------------------------------------------------------- */

type Membership = NonNullable<Awaited<ReturnType<typeof membershipByToken>>>;

/** Words of the topics the student may study today, in syllabus order. */
async function openWords(db: DbClient, membership: Membership) {
  const group = await db.group.findUniqueOrThrow({
    where: { id: membership.groupId },
    select: { courseId: true },
  });
  const [topics, lessons, releases] = await Promise.all([
    db.courseTopic.findMany({
      where: { courseId: group.courseId, words: { some: {} } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        title: true,
        words: { orderBy: { sortOrder: "asc" } },
      },
    }),
    db.lesson.findMany({
      where: { groupId: membership.groupId, courseTopicId: { not: null } },
      select: { date: true, courseTopicId: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.groupTopicRelease.findMany({ where: { groupId: membership.groupId } }),
  ]);
  const covered = new Map<string, string>();
  for (const l of lessons) {
    if (l.courseTopicId && !covered.has(l.courseTopicId)) {
      covered.set(l.courseTopicId, dateToIso(l.date));
    }
  }
  const releaseByTopic = new Map(releases.map((r) => [r.topicId, releaseOf(r)]));
  const now = today();
  return topics
    .filter((t) =>
      topicOpen(releaseByTopic.get(t.id) ?? releaseOf(null), covered.get(t.id) ?? null, now),
    )
    .flatMap((t) => t.words.map((w) => ({ ...w, topicTitle: t.title })));
}

async function summary(db: DbClient, membership: Membership): Promise<PortalVocabDto> {
  const words = await openWords(db, membership);
  const now = new Date();
  const day = localDay(now);
  const [cards, streak, todayRow] = await Promise.all([
    db.vocabCard.findMany({
      where: { membershipId: membership.id, wordId: { in: words.map((w) => w.id) } },
    }),
    vocabStreak(db, membership.id, day),
    db.vocabDay.findUnique({
      where: { membershipId_date: { membershipId: membership.id, date: isoToDate(day) } },
    }),
  ]);
  const byWord = new Map(cards.map((c) => [c.wordId, c]));
  const due = words
    .map((w) => ({ word: w, card: byWord.get(w.id) }))
    .filter(({ card }) => !card || card.dueAt <= now)
    .sort((a, b) => {
      // Reviews first, oldest due first; new words after, in syllabus order.
      if (a.card && b.card) return a.card.dueAt.getTime() - b.card.dueAt.getTime();
      if (a.card) return -1;
      if (b.card) return 1;
      return 0;
    });
  return {
    total: words.length,
    learned: cards.filter((c) => c.box >= VOCAB_LEARNED_BOX).length,
    due: due.length,
    streak,
    todayReviewed: todayRow?.reviewed ?? 0,
    cards: due.slice(0, SESSION).map(({ word, card }) => ({
      ...toDto(word),
      topicTitle: word.topicTitle,
      box: card?.box ?? 0,
    })),
  };
}

export async function getPortalVocab(
  token: string,
  db: DbClient = prisma,
): Promise<PortalVocabDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  return summary(db, membership);
}

/** One flashcard answered: the box moves, the day is counted, a streak may earn coins and a badge. */
export async function reviewPortalWord(
  token: string,
  wordId: string,
  input: VocabReviewInput,
  db: DbClient = prisma,
): Promise<PortalVocabDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const words = await openWords(db, membership);
  if (!words.some((w) => w.id === wordId)) throw AppError.notFound();
  const now = new Date();
  const day = localDay(now);
  await db.$transaction(async (tx) => {
    const card = await tx.vocabCard.findUnique({
      where: { membershipId_wordId: { membershipId: membership.id, wordId } },
    });
    const box = input.known ? Math.min((card?.box ?? 0) + 1, VOCAB_INTERVALS_DAYS.length - 1) : 0;
    const dueAt = new Date(now);
    if (box === 0) dueAt.setMinutes(dueAt.getMinutes() + 10);
    else dueAt.setDate(dueAt.getDate() + VOCAB_INTERVALS_DAYS[box]!);
    await tx.vocabCard.upsert({
      where: { membershipId_wordId: { membershipId: membership.id, wordId } },
      create: {
        membershipId: membership.id,
        wordId,
        box,
        dueAt,
        reviews: 1,
        correct: input.known ? 1 : 0,
        lastAt: now,
      },
      update: {
        box,
        dueAt,
        reviews: { increment: 1 },
        correct: { increment: input.known ? 1 : 0 },
        lastAt: now,
      },
    });
    await tx.vocabDay.upsert({
      where: { membershipId_date: { membershipId: membership.id, date: isoToDate(day) } },
      create: {
        membershipId: membership.id,
        date: isoToDate(day),
        reviewed: 1,
        correct: input.known ? 1 : 0,
      },
      update: { reviewed: { increment: 1 }, correct: { increment: input.known ? 1 : 0 } },
    });
    const streak = await vocabStreak(tx, membership.id, day);
    if (streak > 0 && streak % VOCAB_STREAK_DAYS === 0) {
      await awardAutoCoins(tx, {
        event: "VOCAB_STREAK",
        studentId: membership.studentId,
        groupId: membership.groupId,
        refKey: `vocab:${membership.id}:${day}`,
      });
    }
    await checkBadges(tx, membership.studentId);
  });
  return summary(db, membership);
}
