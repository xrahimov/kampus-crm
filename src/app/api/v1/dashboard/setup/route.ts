import { setupChecklistSchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import {
  getSetupChecklist,
  setSetupChecklistShown,
} from "@/server/services/dashboard/setup.service";

/** The setup checklist on the home page (A-128). */
export const GET = route({ permission: "settings.org" }, async ({ current }) =>
  json(await getSetupChecklist(current.actor)),
);

/** `{ shown: false }` hides it; `{ shown: true }` brings it back. */
export const PATCH = route<typeof setupChecklistSchema._output>(
  { permission: "settings.org", body: setupChecklistSchema },
  async ({ current, body }) => json(await setSetupChecklistShown(current.actor, body.shown)),
);
