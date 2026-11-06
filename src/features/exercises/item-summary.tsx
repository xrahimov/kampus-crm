import type { ExerciseItem } from "@/lib/validation/exercises";

/** One line describing an item's key, for the teacher's list. */
export function itemSummary(item: ExerciseItem): string {
  switch (item.kind) {
    case "CHOICE":
      return item.options.map((o, i) => (item.correct.includes(i) ? `✓ ${o}` : o)).join(" · ");
    case "TRUE_FALSE":
      return item.correct ? "✓ true" : "✓ false";
    case "GAP":
      return item.answers.map((a) => a.join(" | ")).join(" · ");
    case "MATCH":
      return item.pairs.map((p) => `${p.left} = ${p.right}`).join(" · ");
    case "ORDER":
      return item.items.join(" → ");
    case "SHORT":
      return item.answers.join(" | ");
  }
}
