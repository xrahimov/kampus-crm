import { json, route } from "@/server/http/handler";

export const GET = route({}, async ({ current }) => {
  return json({
    user: current.user,
    roles: current.roles,
    permissions: current.actor.permissions,
    branches: current.branches,
    activeBranch: current.activeBranch,
  });
});
