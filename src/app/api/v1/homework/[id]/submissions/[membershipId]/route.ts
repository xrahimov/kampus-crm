import { homeworkReviewSchema } from "@/lib/validation/groups";
import { route } from "@/server/http/handler";
import { reviewSubmission } from "@/server/services/homework/homework.service";

type Params = { id: string; membershipId: string };

/** The teacher accepts or returns one student's answer. */
export const PATCH = route<typeof homeworkReviewSchema._output, Params>(
  { permission: "groups.attendance.mark", body: homeworkReviewSchema },
  async ({ current, body, params }) => {
    await reviewSubmission(current.actor, params.id, params.membershipId, body);
    return new Response(null, { status: 204 });
  },
);
