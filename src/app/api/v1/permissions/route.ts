import { json, route } from "@/server/http/handler";
import { permissionCatalogue } from "@/server/services/staff/roles.service";

/** The permission catalogue, grouped by module, for the role editor. */
export const GET = route({ permission: "settings.roles" }, async () =>
  json({ modules: permissionCatalogue() }),
);
