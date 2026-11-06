import { json, route } from "@/server/http/handler";
import {
  countCheckingQueue,
  listCheckingQueue,
} from "@/server/services/homework/checking-queue.service";

/** The teacher's checking queue (A-160); `?count=1` returns only the number waiting. */
export const GET = route({ permission: "groups.attendance.mark" }, async ({ current, request }) => {
  if (request.nextUrl.searchParams.get("count") === "1") {
    return json({ count: await countCheckingQueue(current.actor) });
  }
  return json(await listCheckingQueue(current.actor));
});
