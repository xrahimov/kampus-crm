import { z } from "zod";

import { idSchema } from "@/lib/validation/common";
import { sheetFromForm } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import {
  detectSoffFile,
  runSoffImport,
  SOFF_KINDS,
} from "@/server/services/imports/soff-import.service";

/**
 * Settings → Import from SOFF CRM (A-143): multipart `file` + `branchId`. With
 * `detect=1` the answer only says which export the file is and how its columns
 * map; otherwise `kind` names the export and `dryRun=1` previews without writing.
 * The service checks the permission the matching Kampus importer asks for.
 */
export const POST = route({ permission: "students.view" }, async ({ current, request }) => {
  const form = await request.formData().catch(() => null);
  const rows = await sheetFromForm(form);
  const flag = (name: string) => ["1", "true"].includes(String(form?.get(name) ?? ""));
  const kindParsed = z
    .enum(SOFF_KINDS)
    .optional()
    .safeParse(form?.get("kind") || undefined);
  const hint = kindParsed.success ? kindParsed.data : undefined;
  if (flag("detect")) return json(detectSoffFile(rows, hint));
  const branchId = idSchema.safeParse(form?.get("branchId"));
  if (!branchId.success) throw AppError.validation({ branchId: ["validation.required"] });
  if (!hint) throw AppError.validation({ kind: ["validation.required"] });
  return json(
    await runSoffImport(
      current.actor,
      { kind: hint, branchId: branchId.data, dryRun: flag("dryRun") },
      rows,
    ),
  );
});
