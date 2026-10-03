import { receiptSettingsSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import {
  getReceiptSettings,
  updateReceiptSettings,
} from "@/server/services/settings/receipt-settings.service";

export const GET = route({ permission: "settings.org" }, async ({ current }) =>
  json(await getReceiptSettings(current.actor)),
);

export const PUT = route(
  { permission: "settings.org", body: receiptSettingsSchema },
  async ({ current, body }) => json(await updateReceiptSettings(current.actor, body)),
);
