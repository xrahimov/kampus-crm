import { useMe, can } from "@/lib/session";

import { GroupsScreen } from "../staff/groups-screen";
import { OfficeGroupsScreen } from "./office-groups-screen";

/**
 * The Groups tab: the office (the full view) gets every group with filters
 * and "New group" (A-233); a teacher keeps the cards of the groups they teach.
 */
export function GroupsTab() {
  const me = useMe();
  return me.view.current === "FULL" && can(me, "groups.view") ? (
    <OfficeGroupsScreen />
  ) : (
    <GroupsScreen />
  );
}
