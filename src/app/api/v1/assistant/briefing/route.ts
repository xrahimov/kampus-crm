import { briefingRequestSchema, type BriefingRequest } from "@/lib/validation/ai";
import { json, route } from "@/server/http/handler";
import { getBriefing } from "@/server/services/ai/briefing.service";

/**
 * A person's summary for one period (A-190). The service decides who may have
 * one and what it counts; `refresh` asks for the conclusion to be written again,
 * `write: false` for the figures alone while the conclusion is still to come.
 */
export const POST = route<BriefingRequest>(
  { body: briefingRequestSchema },
  async ({ current, body }) =>
    json(await getBriefing(current.actor, body, { refresh: body.refresh, write: body.write })),
);
