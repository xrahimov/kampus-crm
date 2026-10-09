import type { Permission } from "@/lib/rbac/permissions";

/**
 * The reference's "Sozlamalar" dropdown (EXP §8), in its order. Items without a
 * `phase` are live; the rest show the phase that builds them (ARCHITECTURE §7).
 */
export interface SettingsNavItem {
  key: string;
  href: string;
  permission: Permission;
  /** Shown to the site owner only, whatever their roles (A-108). */
  siteOwner?: boolean;
  phase?: number;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { key: "general", href: "/settings/general", permission: "settings.org" },
  {
    key: "organizations",
    href: "/settings/organizations",
    permission: "settings.org",
    siteOwner: true,
  },
  { key: "courses", href: "/settings/courses", permission: "settings.catalog" },
  { key: "rooms", href: "/settings/rooms", permission: "settings.catalog" },
  { key: "daysOff", href: "/settings/days-off", permission: "settings.catalog" },
  { key: "schools", href: "/settings/schools", permission: "settings.catalog" },
  { key: "staff", href: "/settings/staff", permission: "staff.view" },
  { key: "migration", href: "/settings/migration", permission: "students.create" },
  { key: "roles", href: "/settings/roles", permission: "settings.roles" },
  { key: "sms", href: "/settings/sms", permission: "settings.catalog" },
  { key: "receipt", href: "/settings/receipt", permission: "settings.org" },
  { key: "coins", href: "/settings/coins", permission: "settings.org" },
  { key: "tests", href: "/settings/tests", permission: "tests.view" },
  { key: "payments", href: "/settings/payments", permission: "reports.payments" },
  { key: "forms", href: "/settings/forms", permission: "settings.catalog" },
  { key: "calls", href: "/settings/calls", permission: "logs.view" },
  { key: "logins", href: "/settings/logs/logins", permission: "logs.view" },
  { key: "actions", href: "/settings/logs/actions", permission: "logs.view" },
  { key: "smsLog", href: "/settings/logs/sms", permission: "logs.view" },
  { key: "bot", href: "/settings/bot", permission: "settings.integrations" },
  { key: "integrations", href: "/settings/integrations", permission: "settings.integrations" },
  { key: "amocrm", href: "/settings/integrations/amocrm", permission: "settings.integrations" },
  { key: "faceId", href: "/settings/integrations/face-id", permission: "settings.integrations" },
];
