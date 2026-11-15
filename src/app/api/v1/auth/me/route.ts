import { json, route } from "@/server/http/handler";

export const GET = route({}, async ({ current }) => {
  return json({
    user: current.user,
    roles: current.roles,
    // Which side of Kampus is in force; `permissions` are those of that side (A-194).
    view: current.view,
    permissions: current.actor.permissions,
    branches: current.branches,
    activeBranch: current.activeBranch,
  });
});
