import { assistantAskSchema, type AssistantAskInput } from "@/lib/validation/ai";
import { json, route } from "@/server/http/handler";
import { askAssistant } from "@/server/services/ai/assistant.service";

/** The Assistant page asks here with the whole conversation (A-149). */
export const POST = route<AssistantAskInput>(
  { permission: "dashboard.view", body: assistantAskSchema },
  async ({ current, body }) => json(await askAssistant(current.actor, body, body.locale)),
);
