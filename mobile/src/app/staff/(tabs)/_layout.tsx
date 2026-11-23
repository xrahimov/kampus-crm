import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";
import { CalendarCheck, ClipboardCheck, Contact, House, Menu, Users } from "lucide-react-native";

import { useCheckingQueue } from "@/api/hooks";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop, GlassScope } from "@/components/glass";
import { barSpace, NavItem, NavList } from "@/components/nav";
import { BottomBarSpace } from "@/components/surface";
import { renderTab } from "@/components/tab-fade";
import { hasHome } from "@/features/office/site-paths";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";

export default function StaffTabs() {
  const t = useTranslations();
  const { wide } = useLayout();
  const me = useMe();
  const queue = useCheckingQueue(can(me, "groups.attendance.mark"));
  const insets = useSafeAreaInsets();
  // The office starts at the centre's home (A-230); five places fit the bar, so its checking
  // queue is opened from the menu under More. Teachers keep their four and Checking.
  const office = hasHome(me);
  // On a phone the bar is glass floating over the page (A-224): the page is its backdrop and
  // every screen leaves room for it at the bottom. A tablet's rail stands beside the page.
  return (
    <GlassScope>
      <BottomBarSpace value={wide ? 0 : barSpace(insets.bottom)}>
        <Tabs style={{ flex: 1, flexDirection: wide ? "row-reverse" : "column" }}>
          <Backdrop style={{ flex: 1 }}>
            <TabSlot style={{ flex: 1 }} renderFn={renderTab} />
          </Backdrop>
          <TabList asChild>
            <NavList wide={wide}>
              {office ? (
                <TabTrigger name="home" href="/staff/home" asChild>
                  <NavItem wide={wide} icon={House} label={t("nav.dashboard")} testID="nav-home" />
                </TabTrigger>
              ) : null}
              <TabTrigger name="today" href="/staff" asChild>
                <NavItem
                  wide={wide}
                  icon={CalendarCheck}
                  label={t("nav.today")}
                  testID="nav-today"
                />
              </TabTrigger>
              <TabTrigger name="groups" href="/staff/groups" asChild>
                <NavItem wide={wide} icon={Users} label={t("nav.groups")} testID="nav-groups" />
              </TabTrigger>
              {office && !wide ? (
                // Still a place of the tabs, so the menu can open it; it only has no button.
                <TabTrigger name="checking" href="/staff/checking" style={{ display: "none" }} />
              ) : (
                <TabTrigger name="checking" href="/staff/checking" asChild>
                  <NavItem
                    wide={wide}
                    icon={ClipboardCheck}
                    label={t("nav.checking")}
                    count={queue.data?.total ?? 0}
                    testID="nav-checking"
                  />
                </TabTrigger>
              )}
              {!office ? (
                <TabTrigger name="home" href="/staff/home" style={{ display: "none" }} />
              ) : null}
              {/* The students a teacher may see; the office's rights decide who has the page. */}
              {can(me, "students.view") ? (
                <TabTrigger name="students" href="/staff/students" asChild>
                  <NavItem
                    wide={wide}
                    icon={Contact}
                    label={t("nav.students")}
                    testID="nav-students"
                  />
                </TabTrigger>
              ) : null}
              <TabTrigger name="more" href="/staff/more" asChild>
                <NavItem wide={wide} icon={Menu} label={t("nav.more")} testID="nav-more" />
              </TabTrigger>
            </NavList>
          </TabList>
        </Tabs>
      </BottomBarSpace>
    </GlassScope>
  );
}
