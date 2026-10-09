import { debtContactSchema } from "@/lib/validation/debts";
import { json, route } from "@/server/http/handler";
import { listDebtContacts, logDebtContact } from "@/server/services/debts/debts.service";

type Params = { id: string };

/** The history of one debt case, newest first (A-112). */
export const GET = route<undefined, Params>(
  { permission: "payments.create" },
  async ({ current, params }) => json(await listDebtContacts(current.actor, params.id)),
);

/** "Log a contact": a call, visit, message or note, optionally with a promise to pay. */
export const POST = route<typeof debtContactSchema._output, Params>(
  { permission: "payments.create", body: debtContactSchema },
  async ({ current, params, body }) =>
    json(await logDebtContact(current.actor, params.id, body), { status: 201 }),
);
