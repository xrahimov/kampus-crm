import { z } from "zod";

/** Vocabulary trainer (A-165): the words of a topic and a flashcard answer. */
export const VOCAB_WORDS_MAX = 200;
export const vocabWordSchema = z.object({
  term: z.string().trim().min(1, "validation.required").max(120, "validation.tooLong"),
  translation: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
  example: z.string().trim().max(300, "validation.tooLong").nullable().optional(),
});
export type VocabWordInput = z.infer<typeof vocabWordSchema>;
export const vocabWordsSchema = z.object({
  words: z.array(vocabWordSchema).max(VOCAB_WORDS_MAX),
});
export type VocabWordsInput = z.infer<typeof vocabWordsSchema>;

export const vocabReviewSchema = z.object({ known: z.boolean() });
export type VocabReviewInput = z.infer<typeof vocabReviewSchema>;

/** Leitner boxes: days until a word comes back after a right answer in box n. */
export const VOCAB_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30] as const;
/** From this box on a word counts as learned. */
export const VOCAB_LEARNED_BOX = 4;
/** Days in a row that earn the streak coins and the badge. */
export const VOCAB_STREAK_DAYS = 7;

/**
 * "term — translation — example" lines, also accepting "-", "–", ";" or a tab
 * as the separator; blank lines are skipped.
 */
export function parseWordLines(text: string): VocabWordInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+[—–-]\s+|\t|\s*;\s*/).map((p) => p.trim());
      return {
        term: parts[0] ?? "",
        translation: parts[1] ?? "",
        example: parts[2] ? parts[2] : null,
      };
    });
}

export function wordLines(words: VocabWordInput[]): string {
  return words
    .map((w) => [w.term, w.translation, w.example].filter(Boolean).join(" — "))
    .join("\n");
}
