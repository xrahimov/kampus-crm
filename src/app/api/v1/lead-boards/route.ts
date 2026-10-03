import type { z } from "zod";

import { idSchema } from "@/lib/validation/common";
import { leadBoardSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { createBoard, listBoards } from "@/server/services/leads/boards.service";

export const GET = route({ permission: "leads.view" }, async ({ current }) =>
  json(await listBoards(current.actor)),
);

const createSchema = leadBoardSchema.extend({ branchId: idSchema });

/** "BO'LIM YARATISH" at board level creates a pipeline with a first column (EXP §2). */
export const POST = route<z.infer<typeof createSchema>>(
  { permission: "leads.update", body: createSchema },
  async ({ current, body }) => json(await createBoard(current.actor, body), { status: 201 }),
);
