import { smsCategorySchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { createSmsCategory, listSmsCategories } from "@/server/services/sms/templates.service";

/** Settings → "SMS shablonlari" categories (EXP §8). */
export const GET = route({ permission: "settings.catalog" }, async ({ current }) =>
  json(await listSmsCategories(current.actor)),
);

export const POST = route<typeof smsCategorySchema._output>(
  { permission: "settings.catalog", body: smsCategorySchema },
  async ({ current, body }) => json(await createSmsCategory(current.actor, body), { status: 201 }),
);
