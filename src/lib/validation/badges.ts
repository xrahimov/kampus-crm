/** Badges (A-163): the fixed catalogue shared by the server and the client. */
export const BADGE_CODES = [
  "firstHomework",
  "homework10",
  "streak10",
  "perfectMonth",
  "exercises10",
  "exerciseAce",
  "testAce",
  "coins100",
  "words50",
  "vocabStreak7",
] as const;
export type BadgeCode = (typeof BADGE_CODES)[number];

/** Lessons in one calendar month, all attended, that make a perfect month. */
export const PERFECT_MONTH_LESSONS = 8;
export const STREAK_LESSONS = 10;

export interface BadgeDto {
  code: BadgeCode;
  /** When it was earned; null while it is still locked. */
  earnedAt: string | null;
  groupName: string | null;
}
