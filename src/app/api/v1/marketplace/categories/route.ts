import { productCategorySchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import {
  createProductCategory,
  listProductCategories,
} from "@/server/services/coins/marketplace.service";

/** "KATEGORIYALAR" dialog (EXP §10 Marketplace). */
export const GET = route({}, async ({ current }) =>
  json(await listProductCategories(current.actor)),
);

export const POST = route<typeof productCategorySchema._output>(
  { permission: "coins.manage", body: productCategorySchema },
  async ({ current, body }) =>
    json(await createProductCategory(current.actor, body), { status: 201 }),
);
