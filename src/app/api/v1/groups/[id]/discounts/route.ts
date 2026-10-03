import { discountSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { giveDiscount, listGroupDiscounts } from "@/server/services/students/discounts.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupDiscounts(current.actor, params.id)),
);

export const POST = route<typeof discountSchema._output, Params>(
  { permission: "discounts.give", body: discountSchema },
  async ({ current, body, params }) =>
    json(await giveDiscount(current.actor, body, params.id), { status: 201 }),
);
