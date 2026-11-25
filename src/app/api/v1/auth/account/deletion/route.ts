import { json, route } from "@/server/http/handler";
import {
  requestStaffDeletion,
  withdrawStaffDeletion,
} from "@/server/services/account-deletion.service";

/** "Ask to delete my account" on My account (A-267): those who manage staff are told. */
export const POST = route({}, async ({ current }) =>
  json(await requestStaffDeletion(current.actor)),
);

/** The person changed their mind. */
export const DELETE = route({}, async ({ current }) => {
  await withdrawStaffDeletion(current.actor);
  return json({ ok: true });
});
