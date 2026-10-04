import { productSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { deleteProduct, updateProduct } from "@/server/services/coins/marketplace.service";

type Params = { id: string };

export const PATCH = route<typeof productSchema._output, Params>(
  { permission: "coins.manage", body: productSchema },
  async ({ current, body, params }) => json(await updateProduct(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "coins.manage" },
  async ({ current, params }) => {
    await deleteProduct(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
