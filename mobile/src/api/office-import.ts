import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiForm, type PickedFile } from "@/lib/api";

/*
 * The import from the old CRM for the app (A-251): the site's Settings →
 * Import from SOFF CRM. One call, `POST /imports/soff`, with the file: first
 * to say which of the old CRM's exports it is, then to preview, then to write.
 */

/** The four exports, in the order they are imported (`SOFF_KINDS` on the server). */
export const IMPORT_KINDS = ["staff", "groups", "students", "payments"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** What the server makes of a file before anything is imported. */
export interface ImportDetection {
  /** Which export the file is; null when it is none the server knows. */
  kind: ImportKind | null;
  /** Kampus field → the heading of the file's column that feeds it. */
  columns: Record<string, string>;
  /** Headings of the file nothing uses. */
  unknown: string[];
  /** Rows of data, the headings not counted. */
  rows: number;
  /** The first rows, field by field, to check the columns against. */
  sample: Array<Record<string, string>>;
}

/** A preview or an import: how many rows go in, which are left out and why. */
export interface ImportRun {
  kind: ImportKind;
  dryRun: boolean;
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
  matched: Array<{ row: number; label: string }>;
  /** What a students file also brings: places in groups and opening balances. */
  extra: Array<{ key: "members" | "balances"; imported: number; skipped: number }>;
  /** A staff import's temporary passwords: answered once, kept nowhere in the app. */
  logins?: Array<{ row: number; label: string; secret: string }>;
}

const PATH = "/imports/soff";

/** Which export a file is and how its columns are read. Nothing is written. */
export function useImportDetect() {
  return useMutation({
    mutationFn: (file: PickedFile) => apiForm<ImportDetection>(PATH, { detect: "1" }, file),
  });
}

/** A preview (`dryRun`) or the import itself, into one branch. */
export function useImportRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      file: PickedFile;
      kind: ImportKind;
      branchId: string;
      dryRun: boolean;
    }) =>
      apiForm<ImportRun>(
        PATH,
        { kind: input.kind, branchId: input.branchId, ...(input.dryRun ? { dryRun: "1" } : {}) },
        input.file,
      ),
    // An import adds staff, groups, students or payments: every list is asked for anew.
    onSuccess: (run) => (run.dryRun ? undefined : client.invalidateQueries()),
  });
}
