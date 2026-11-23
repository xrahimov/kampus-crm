import {
  Banknote,
  Bell,
  CalendarCheck,
  CalendarRange,
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  Contact,
  ExternalLink,
  Funnel,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  ListChecks,
  Megaphone,
  Search,
  Settings2,
  Sparkles,
  UserRoundCheck,
  UserRoundX,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { canViewModule, MODULES, type ModuleKey } from "@kampus/lib/rbac/permissions";

import { useUnreadCount } from "@/api/office";
import { useJoinRequests } from "@/api/office-follow-up";
import { Badge, Card, Divider, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { nativeRoute, useOpenPath } from "./site-paths";

/** The site's page of each item of its navigation (src/components/layout/main-nav.tsx). */
export const MODULE_PATH: Record<ModuleKey, string> = {
  dashboard: "/dashboard",
  assistant: "/assistant",
  today: "/today",
  checking: "/checking",
  leads: "/leads",
  teachers: "/teachers",
  groups: "/groups",
  timetable: "/timetable",
  students: "/students",
  absences: "/absences",
  announcements: "/announcements",
  debts: "/debts",
  cashdesk: "/cashdesk",
  exams: "/exams",
  settings: "/settings",
  finance: "/finance",
  reports: "/reports",
};

const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  dashboard: House,
  assistant: Sparkles,
  today: CalendarCheck,
  checking: ListChecks,
  leads: Funnel,
  teachers: GraduationCap,
  groups: Users,
  timetable: CalendarRange,
  students: Contact,
  absences: UserRoundX,
  announcements: Megaphone,
  debts: HandCoins,
  cashdesk: Wallet,
  exams: ClipboardCheck,
  settings: Settings2,
  finance: Landmark,
  reports: ChartColumn,
};

interface MenuRow {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  count?: number;
}

/**
 * Every page of Kampus the person may open (A-230): the site's navigation as
 * one list, with the bell, the search and "My salary" on top. A page the app
 * has opens in the app; a page it does not have yet opens on the site, already
 * signed in, and carries the arrow that says so.
 *
 * "Sign-in requests" (A-232) is a banner on the site's Students and Staff
 * pages; here it is a row, with the number of people waiting, for whoever may
 * answer them.
 */
export function Menu() {
  const t = useTranslations();
  const me = useMe();
  const { open, error } = useOpenPath();
  const unread = useUnreadCount();
  const joins = useJoinRequests("PENDING", can(me, "students.create") || can(me, "staff.create"));
  // The dashboard is the centre's home: someone in the teaching view has the short menu first.
  const modules = MODULES.filter(
    (m) => canViewModule(me.permissions, m) && (m !== "dashboard" || me.view.current === "FULL"),
  );
  const rows: MenuRow[] = [
    {
      key: "notifications",
      label: t("notifications.title"),
      icon: Bell,
      path: "/notifications",
      count: unread.data ?? 0,
    },
    { key: "search", label: t("mobile.office.searchTitle"), icon: Search, path: "/search" },
    ...(me.user.hasSalary
      ? [{ key: "salary", label: t("salary.title"), icon: Banknote, path: "/account/salary" }]
      : []),
    ...(joins.data && joins.data.doors.length > 0
      ? [
          {
            key: "join-requests",
            label: t("joinRequests.title"),
            icon: UserRoundCheck,
            path: "/join-requests",
            count: joins.data.items.length,
          },
        ]
      : []),
    ...modules.map((m) => ({
      key: m,
      label: t(`nav.${m}`),
      icon: MODULE_ICON[m],
      path: MODULE_PATH[m],
    })),
  ];
  return (
    <View style={styles.wrap}>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      <Card style={styles.flush} testID="menu">
        {rows.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <Divider /> : null}
            <Row row={row} onPress={() => open(row.path)} />
          </View>
        ))}
      </Card>
    </View>
  );
}

function Row({ row, onPress }: { row: MenuRow; onPress: () => void }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const onSite = nativeRoute(row.path) === null;
  const Icon = row.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={onSite ? `${row.label}. ${t("mobile.openOnSite")}` : row.label}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={`menu-${row.key}`}
    >
      <Icon size={20} color={colors.mutedForeground} strokeWidth={1.75} />
      <Text variant="body" style={styles.fill} numberOfLines={1}>
        {row.label}
      </Text>
      {row.count ? (
        <View style={styles.count}>
          <Badge tone="accent" label={row.count > 99 ? "99+" : String(row.count)} />
        </View>
      ) : null}
      {onSite ? (
        <ExternalLink size={16} color={colors.mutedForeground} testID={`menu-${row.key}-site`} />
      ) : (
        <ChevronRight size={18} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  count: { alignSelf: "center" },
  wrap: { gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    minHeight: 48,
  },
});
