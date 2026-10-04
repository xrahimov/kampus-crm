import { sheetFromForm } from "@/server/excel/exports";
import { json, route } from "@/server/http/handler";
import { importMembers } from "@/server/services/students/import.service";

/** "EXCEL ORQALI QO'SHISH" in the add-student dialog (EXP §5): multipart `file`. */
export const POST = route<undefined, { id: string }>(
  { permission: "groups.update" },
  async ({ current, request, params }) => {
    const rows = await sheetFromForm(await request.formData().catch(() => null));
    return json(await importMembers(current.actor, params.id, rows));
  },
);
