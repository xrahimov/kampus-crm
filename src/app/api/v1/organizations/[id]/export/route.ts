import { route } from "@/server/http/handler";
import { exportOrganization } from "@/server/services/settings/owner-console.service";

/** Site owner only (A-144): the centre's data as one JSON file to download. */
export const GET = route<undefined, { id: string }>({}, async ({ current, params }) => {
  const data = await exportOrganization(current.actor, params.id);
  const slug = String(data.organization.name ?? "organization")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kampus-${slug || "organization"}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
