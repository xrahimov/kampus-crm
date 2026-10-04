import { route } from "@/server/http/handler";
import { deleteProductCategory } from "@/server/services/coins/marketplace.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>(
  { permission: "coins.manage" },
  async ({ current, params }) => {
    await deleteProductCategory(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
