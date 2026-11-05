import type { ExerciseAnswer, ExerciseItem } from "@/lib/validation/exercises";

/*
 * Scoring of self-check exercises (A-158), done on the server; the student's
 * page only shows what comes back. Text answers are compared loosely: case,
 * surrounding spaces and repeated spaces do not matter.
 */

export const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface ItemResult {
  /** Points earned and the most the item gives. */
  points: number;
  max: number;
  correct: boolean;
}

/** The most an item can give: one point per gap or pair, else one. */
export function itemMax(item: ExerciseItem): number {
  if (item.kind === "GAP") return item.answers.length;
  if (item.kind === "MATCH") return item.pairs.length;
  return 1;
}

export function scoreItem(item: ExerciseItem, answer: ExerciseAnswer | undefined): ItemResult {
  const max = itemMax(item);
  let points = 0;
  switch (item.kind) {
    case "CHOICE": {
      if (Array.isArray(answer) && answer.every((a) => typeof a === "number")) {
        const chosen = [...new Set(answer as number[])].sort((a, b) => a - b);
        const key = [...item.correct].sort((a, b) => a - b);
        if (chosen.length === key.length && chosen.every((c, i) => c === key[i])) points = 1;
      }
      break;
    }
    case "TRUE_FALSE":
      if (typeof answer === "boolean" && answer === item.correct) points = 1;
      break;
    case "GAP": {
      const given = Array.isArray(answer) ? (answer as unknown[]) : [];
      item.answers.forEach((accepted, i) => {
        const g = given[i];
        if (typeof g === "string" && accepted.some((a) => normalise(a) === normalise(g))) {
          points += 1;
        }
      });
      break;
    }
    case "MATCH": {
      const given = Array.isArray(answer) ? (answer as unknown[]) : [];
      item.pairs.forEach((pair, i) => {
        const g = given[i];
        if (typeof g === "string" && normalise(g) === normalise(pair.right)) points += 1;
      });
      break;
    }
    case "ORDER": {
      const given = Array.isArray(answer) ? (answer as unknown[]) : [];
      if (
        given.length === item.items.length &&
        given.every((g, i) => typeof g === "string" && normalise(g) === normalise(item.items[i]!))
      ) {
        points = 1;
      }
      break;
    }
    case "SHORT":
      if (
        typeof answer === "string" &&
        item.answers.some((a) => normalise(a) === normalise(answer))
      ) {
        points = 1;
      }
      break;
  }
  return { points, max, correct: points === max };
}

export function scoreExercise(
  items: ExerciseItem[],
  answers: Record<string, ExerciseAnswer>,
): { score: number; maxScore: number; percent: number; items: ItemResult[] } {
  const results = items.map((item, i) => scoreItem(item, answers[String(i)]));
  const score = results.reduce((s, r) => s + r.points, 0);
  const maxScore = results.reduce((s, r) => s + r.max, 0);
  return {
    score,
    maxScore,
    percent: maxScore === 0 ? 0 : Math.round((score / maxScore) * 100),
    items: results,
  };
}

/** A stable shuffle: the same seed gives the same order, so a reload keeps the student's view. */
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
