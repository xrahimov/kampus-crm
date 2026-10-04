import { json, route } from "@/server/http/handler";
import { searchCandidates } from "@/server/services/exams/exams.service";

/** `?q=` autocomplete of students who may register for a mock exam. */
export const GET = route<undefined, { id: string }>(
  { permission: "exams.update" },
  async ({ current, params, request }) =>
    json(
      await searchCandidates(current.actor, params.id, request.nextUrl.searchParams.get("q") ?? ""),
    ),
);
