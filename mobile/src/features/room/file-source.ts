/*
 * Where a lesson's file is (A-210): see `@/lib/file-source`, which anything
 * that shows a stored file uses (a product's picture, a person's photo).
 */
export { fileSource, opensWithoutSession, type FileSource } from "@/lib/file-source";

/** "1:05" for 65 seconds; "1:02:03" past an hour. */
export function clock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
