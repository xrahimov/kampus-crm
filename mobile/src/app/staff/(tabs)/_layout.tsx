import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";
import { CalendarCheck, ClipboardCheck, Contact, Menu, Users } from "lucide-react-native";

import { useCheckingQueue } from "@/api/hooks";
import { NavItem, NavList } from "@/components/nav";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";

export default function StaffTabs() {
  const t = useTranslations();
  const { wide } = useLayout();
  const me = useMe();
  const queue = useCheckingQueue(can(me, "groups.attendance.mark"));
  return (
    <Tabs style={{ flex: 1, flexDirection: wide ? "row-reverse" : "column" }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <NavList wide={wide}>
          <TabTrigger name="today" href="/staff" asChild>
            <NavItem wide={wide} icon={CalendarCheck} label={t("nav.today")} testID="nav-today" />
          </TabTrigger>
          <TabTrigger name="groups" href="/staff/groups" asChild>
            <NavItem wide={wide} icon={Users} label={t("nav.groups")} testID="nav-groups" />
          </TabTrigger>
          <TabTrigger name="checking" href="/staff/checking" asChild>
            <NavItem
              wide={wide}
              icon={ClipboardCheck}
              label={t("nav.checking")}
              count={queue.data?.total ?? 0}
              testID="nav-checking"
            />
          </TabTrigger>
          {/* The students a teacher may see; the office's rights decide who has the page. */}
          {can(me, "students.view") ? (
            <TabTrigger name="students" href="/staff/students" asChild>
              <NavItem wide={wide} icon={Contact} label={t("nav.students")} testID="nav-students" />
            </TabTrigger>
          ) : null}
          <TabTrigger name="more" href="/staff/more" asChild>
            <NavItem wide={wide} icon={Menu} label={t("nav.more")} testID="nav-more" />
          </TabTrigger>
        </NavList>
      </TabList>
    </Tabs>
  );
}
