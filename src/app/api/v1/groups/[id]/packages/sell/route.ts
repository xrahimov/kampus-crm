import { sellPackageSchema } from "@/lib/validation/packages";
import { json, route } from "@/server/http/handler";
import { sellPackage } from "@/server/services/students/packages.service";

type Params = { id: string };

/** Sells a package to a member: the payment and the lesson credits in one go (A-178). */
export const POST = route<typeof sellPackageSchema._output, Params>(
  { permission: "payments.create", body: sellPackageSchema },
  async ({ current, body, params }) =>
    json(await sellPackage(current.actor, params.id, body), { status: 201 }),
);
