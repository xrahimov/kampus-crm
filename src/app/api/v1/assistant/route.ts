import { assistantAskSchema, type AssistantAskInput } from "@/lib/validation/ai";
import { json, route } from "@/server/http/handler";
import { askAssistant } from "@/server/services/ai/assistant.service";

/**
 * The Assistant page and the floating assistant ask here with the whole
 * conversation (A-149). The service lets in everyone with a Dashboard or a
 * Today page (A-190); each lookup then follows the asker's own permissions.
 */
export const POST = route<AssistantAskInput>(
  { body: assistantAskSchema },
  async ({ current, body }) => json(await askAssistant(current.actor, body, body.locale)),
);
