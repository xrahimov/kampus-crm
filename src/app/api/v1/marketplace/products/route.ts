import { productSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { createProduct, listProducts } from "@/server/services/coins/marketplace.service";

/** "MAHSULOT QO'SHISH" (EXP §10 Marketplace); `?active=1` lists only active products. */
export const GET = route({}, async ({ current, request }) =>
  json(
    await listProducts(current.actor, {
      activeOnly: request.nextUrl.searchParams.get("active") === "1",
    }),
  ),
);

export const POST = route<typeof productSchema._output>(
  { permission: "coins.manage", body: productSchema },
  async ({ current, body }) => json(await createProduct(current.actor, body), { status: 201 }),
);
