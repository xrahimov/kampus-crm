import { z } from "zod";

import { idSchema } from "@/lib/validation/common";
import { json, route } from "@/server/http/handler";
import { importProviderTemplates } from "@/server/services/sms/templates.service";

const body = z.object({ categoryId: idSchema });

/** "Eskizdan import qilish": copies the provider's templates into a category (A-84). */
export const POST = route<z.output<typeof body>>(
  { permission: "settings.catalog", body },
  async ({ current, body }) => json(await importProviderTemplates(current.actor, body.categoryId)),
);
