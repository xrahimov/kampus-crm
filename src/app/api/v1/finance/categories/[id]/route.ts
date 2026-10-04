import { financeCategorySchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import {
  deleteCategory,
  getCategory,
  updateCategory,
} from "@/server/services/finance/categories.service";

type Params = { id: string };
const renameSchema = financeCategorySchema.pick({ name: true });

export const GET = route<undefined, Params>(
  { permission: "finance.view" },
  async ({ current, params }) => json(await getCategory(current.actor, params.id)),
);

export const PATCH = route<typeof renameSchema._output, Params>(
  { permission: "finance.update", body: renameSchema },
  async ({ current, body, params }) => json(await updateCategory(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "finance.delete" },
  async ({ current, params }) => {
    await deleteCategory(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
