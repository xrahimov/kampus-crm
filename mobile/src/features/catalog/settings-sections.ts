/**
 * The site's Settings sections (`src/features/settings/settings-nav.ts`), in
 * its order, with the permission each one needs. A test reads the site's file
 * and fails when the two lists part ways.
 *
 * "Organisations" is the site owner's page; the app is not told who that is,
 * so the section is left to the site.
 */
export interface SettingsSection {
  key: string;
  path: string;
  permission: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: "general", path: "/settings/general", permission: "settings.org" },
  { key: "courses", path: "/settings/courses", permission: "settings.catalog" },
  { key: "rooms", path: "/settings/rooms", permission: "settings.catalog" },
  { key: "daysOff", path: "/settings/days-off", permission: "settings.catalog" },
  { key: "schools", path: "/settings/schools", permission: "settings.catalog" },
  { key: "staff", path: "/settings/staff", permission: "staff.view" },
  { key: "migration", path: "/settings/migration", permission: "students.create" },
  { key: "roles", path: "/settings/roles", permission: "settings.roles" },
  { key: "sms", path: "/settings/sms", permission: "settings.catalog" },
  { key: "receipt", path: "/settings/receipt", permission: "settings.org" },
  { key: "coins", path: "/settings/coins", permission: "settings.org" },
  { key: "tests", path: "/settings/tests", permission: "tests.view" },
  { key: "payments", path: "/settings/payments", permission: "reports.payments" },
  { key: "forms", path: "/settings/forms", permission: "settings.catalog" },
  { key: "calls", path: "/settings/calls", permission: "logs.view" },
  { key: "logins", path: "/settings/logs/logins", permission: "logs.view" },
  { key: "actions", path: "/settings/logs/actions", permission: "logs.view" },
  { key: "smsLog", path: "/settings/logs/sms", permission: "logs.view" },
  { key: "bot", path: "/settings/bot", permission: "settings.integrations" },
  { key: "integrations", path: "/settings/integrations", permission: "settings.integrations" },
  { key: "amocrm", path: "/settings/integrations/amocrm", permission: "settings.integrations" },
  { key: "faceId", path: "/settings/integrations/face-id", permission: "settings.integrations" },
];
