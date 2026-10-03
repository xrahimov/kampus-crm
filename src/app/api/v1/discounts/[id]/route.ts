import { route } from "@/server/http/handler";
import { deleteDiscount } from "@/server/services/students/discounts.service";

export const DELETE = route<undefined, { id: string }>(
  { permission: "discounts.give" },
  async ({ current, params }) => {
    await deleteDiscount(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
