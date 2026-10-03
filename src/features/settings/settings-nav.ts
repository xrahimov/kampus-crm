import type { Permission } from "@/lib/rbac/permissions";

/**
 * The reference's "Sozlamalar" dropdown (EXP §8), in its order. Items without a
 * `phase` are live; the rest show the phase that builds them (ARCHITECTURE §7).
 */
export interface SettingsNavItem {
  key: string;
  href: string;
  permission: Permission;
  phase?: number;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { key: "general", href: "/settings/general", permission: "settings.org" },
  { key: "courses", href: "/settings/courses", permission: "settings.catalog" },
  { key: "rooms", href: "/settings/rooms", permission: "settings.catalog" },
  { key: "daysOff", href: "/settings/days-off", permission: "settings.catalog" },
  { key: "schools", href: "/settings/schools", permission: "settings.catalog" },
  { key: "staff", href: "/settings/staff", permission: "staff.view", phase: 4 },
  { key: "roles", href: "/settings/roles", permission: "settings.roles", phase: 4 },
  { key: "sms", href: "/settings/sms", permission: "settings.catalog", phase: 11 },
  { key: "receipt", href: "/settings/receipt", permission: "settings.org", phase: 6 },
  { key: "coins", href: "/settings/coins", permission: "settings.org", phase: 10 },
  { key: "tests", href: "/settings/tests", permission: "tests.view", phase: 10 },
  { key: "payments", href: "/settings/payments", permission: "reports.payments", phase: 6 },
  { key: "forms", href: "/settings/forms", permission: "settings.catalog", phase: 7 },
  { key: "calls", href: "/settings/calls", permission: "logs.view", phase: 11 },
  { key: "logins", href: "/settings/logs/logins", permission: "logs.view", phase: 11 },
  { key: "actions", href: "/settings/logs/actions", permission: "logs.view", phase: 11 },
  { key: "smsLog", href: "/settings/logs/sms", permission: "logs.view", phase: 11 },
  { key: "bot", href: "/settings/bot", permission: "settings.integrations", phase: 11 },
  {
    key: "amocrm",
    href: "/settings/integrations/amocrm",
    permission: "settings.integrations",
    phase: 11,
  },
  {
    key: "faceId",
    href: "/settings/integrations/face-id",
    permission: "settings.integrations",
    phase: 11,
  },
];
