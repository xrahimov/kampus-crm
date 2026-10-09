import type { Permission } from "@/lib/rbac/permissions";

/**
 * The manual's structure, shared by every language: which articles exist, in
 * what order, who they are for and which screenshot each section shows. The
 * words live in `content/<locale>.ts`, keyed by these ids, so the three
 * languages cannot drift apart without a type error.
 */

/** Audiences a reader can pick on the Help home. Students read from their personal page. */
export const HELP_AUDIENCES = [
  "CEO",
  "BRANCH_MANAGER",
  "ADMIN",
  "CASHIER",
  "TEACHER",
  "STUDENT",
] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

export const HELP_ARTICLE_IDS = [
  "gettingStarted",
  "dashboard",
  "today",
  "leads",
  "groups",
  "teaching",
  "students",
  "payments",
  "debts",
  "absences",
  "announcements",
  "exams",
  "testsAndCoins",
  "finance",
  "reports",
  "staffAndRoles",
  "settings",
  "integrations",
  "organizations",
  "studentPortal",
] as const;
export type HelpArticleId = (typeof HELP_ARTICLE_IDS)[number];

export interface HelpSectionSpec {
  id: string;
  /** File under /help/<locale>/, without extension. */
  screenshot?: string;
}

export interface HelpArticleSpec {
  id: HelpArticleId;
  slug: string;
  /** Who the article is written for; the Help home filters by it. */
  audiences: readonly HelpAudience[];
  /** The permission that unlocks the page the article describes; `null` for everyone. */
  permission: Permission | null;
  /** Where the described page lives, for the "Open the page" link. */
  path: string | null;
  /** Readable without signing in (shown from the student's page). */
  isPublic?: boolean;
  /** Only the site owner sees the page, so only they see the article (A-108). */
  siteOwner?: boolean;
  sections: readonly HelpSectionSpec[];
}

const STAFF = ["CEO", "BRANCH_MANAGER", "ADMIN", "CASHIER", "TEACHER"] as const;
const MANAGEMENT = ["CEO", "BRANCH_MANAGER", "ADMIN"] as const;

export const HELP_ARTICLES = [
  {
    id: "gettingStarted",
    slug: "getting-started",
    audiences: STAFF,
    permission: null,
    path: "/dashboard",
    sections: [
      { id: "signIn", screenshot: "login" },
      { id: "layout", screenshot: "dashboard" },
      { id: "search", screenshot: "search" },
      { id: "branchAndLanguage" },
      { id: "notifications", screenshot: "notifications" },
      { id: "roles" },
      { id: "account" },
      { id: "mySalary" },
      { id: "help", screenshot: "help" },
    ],
  },
  {
    id: "dashboard",
    slug: "dashboard",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "CASHIER"],
    permission: "dashboard.view",
    path: "/dashboard",
    sections: [
      { id: "setup" },
      { id: "kpis", screenshot: "dashboard-numbers" },
      { id: "schedule", screenshot: "dashboard-schedule" },
      { id: "finance" },
    ],
  },
  {
    id: "leads",
    slug: "leads",
    audiences: MANAGEMENT,
    permission: "leads.view",
    path: "/leads",
    sections: [
      { id: "board", screenshot: "leads" },
      { id: "addLead", screenshot: "lead-form" },
      { id: "workLeads" },
      { id: "followUp" },
      { id: "trials" },
      { id: "toGroup", screenshot: "leads-to-group" },
      { id: "sources", screenshot: "lead-sources" },
      { id: "forms" },
    ],
  },
  {
    id: "groups",
    slug: "groups",
    audiences: STAFF,
    permission: "groups.view",
    path: "/groups",
    sections: [
      { id: "list", screenshot: "groups" },
      { id: "create", screenshot: "group-form" },
      { id: "detail", screenshot: "group-detail" },
      { id: "members", screenshot: "group-members" },
      { id: "tabs" },
      { id: "changes" },
      { id: "timetable" },
    ],
  },
  {
    id: "today",
    slug: "today",
    audiences: ["TEACHER", "BRANCH_MANAGER", "ADMIN"],
    permission: "groups.view",
    path: "/today",
    sections: [{ id: "day" }, { id: "attendance" }, { id: "homework" }, { id: "install" }],
  },
  {
    id: "teaching",
    slug: "teaching",
    audiences: ["TEACHER", "BRANCH_MANAGER", "ADMIN"],
    permission: "groups.attendance.mark",
    path: "/groups",
    sections: [
      { id: "day", screenshot: "teacher-groups" },
      { id: "attendance", screenshot: "attendance" },
      { id: "grades", screenshot: "grades" },
      { id: "homework", screenshot: "homework" },
      { id: "materials", screenshot: "materials" },
      { id: "video", screenshot: "video-card" },
      { id: "links", screenshot: "student-links" },
      { id: "coins" },
      { id: "tests" },
    ],
  },
  {
    id: "students",
    slug: "students",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "CASHIER"],
    permission: "students.view",
    path: "/students",
    sections: [
      { id: "list", screenshot: "students" },
      { id: "bulk" },
      { id: "add", screenshot: "student-form" },
      { id: "profile", screenshot: "student-profile" },
      { id: "groupsTab" },
      { id: "moreTabs" },
      { id: "familyInstalments" },
      { id: "importExport" },
      { id: "leaving" },
    ],
  },
  {
    id: "payments",
    slug: "payments",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "CASHIER"],
    permission: "payments.create",
    path: "/settings/payments",
    sections: [
      { id: "balance" },
      { id: "record", screenshot: "payment-dialog" },
      { id: "receipt", screenshot: "receipt" },
      { id: "refund" },
      { id: "openingBalances" },
      { id: "discounts" },
      { id: "log", screenshot: "payments-log" },
      { id: "online" },
    ],
  },
  {
    id: "debts",
    slug: "debtors",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "CASHIER"],
    permission: "payments.create",
    path: "/debts",
    sections: [{ id: "list" }, { id: "contact" }, { id: "cadence" }],
  },
  {
    id: "absences",
    slug: "absences",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN"],
    permission: "students.update",
    path: "/absences",
    sections: [{ id: "list" }, { id: "contact" }, { id: "rules" }],
  },
  {
    id: "announcements",
    slug: "announcements",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "TEACHER"],
    permission: "announcements.view",
    path: "/announcements",
    sections: [{ id: "post" }, { id: "reach" }],
  },
  {
    id: "exams",
    slug: "exams",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "TEACHER"],
    permission: "exams.view",
    path: "/exams",
    sections: [
      { id: "list", screenshot: "exams" },
      { id: "groupExam", screenshot: "exam-form" },
      { id: "mockExam" },
      { id: "grading", screenshot: "exam-results" },
    ],
  },
  {
    id: "testsAndCoins",
    slug: "tests-and-coins",
    audiences: ["CEO", "BRANCH_MANAGER", "ADMIN", "TEACHER"],
    permission: "tests.view",
    path: "/settings/tests",
    sections: [
      { id: "bank", screenshot: "question-bank" },
      { id: "tests", screenshot: "tests" },
      { id: "attempts" },
      { id: "coinRules", screenshot: "coin-settings" },
      { id: "giveCoins" },
      { id: "marketplace", screenshot: "coins-report" },
    ],
  },
  {
    id: "finance",
    slug: "finance",
    audiences: ["CEO", "BRANCH_MANAGER", "CASHIER"],
    permission: "finance.view",
    path: "/finance",
    sections: [
      { id: "overview", screenshot: "finance" },
      { id: "plan" },
      { id: "categories", screenshot: "finance-category" },
      { id: "staffMoney" },
      { id: "payroll", screenshot: "payroll" },
      { id: "cashClose" },
    ],
  },
  {
    id: "reports",
    slug: "reports",
    audiences: MANAGEMENT,
    permission: "reports.view",
    path: "/reports",
    sections: [
      { id: "index", screenshot: "reports" },
      { id: "money", screenshot: "report-payments" },
      { id: "students", screenshot: "report-churn" },
      { id: "center" },
      { id: "excel" },
    ],
  },
  {
    id: "staffAndRoles",
    slug: "staff-and-roles",
    audiences: MANAGEMENT,
    permission: "staff.view",
    path: "/settings/staff",
    sections: [
      { id: "teachers", screenshot: "teachers" },
      { id: "add", screenshot: "staff-form" },
      { id: "salary" },
      { id: "roles", screenshot: "roles" },
      { id: "archive" },
    ],
  },
  {
    id: "settings",
    slug: "settings",
    audiences: ["CEO", "BRANCH_MANAGER"],
    permission: "settings.catalog",
    path: "/settings",
    sections: [
      { id: "general", screenshot: "settings-general" },
      { id: "switches" },
      { id: "catalog", screenshot: "settings-courses" },
      { id: "sms", screenshot: "settings-sms" },
      { id: "receipt" },
      { id: "forms" },
      { id: "logs", screenshot: "settings-logs" },
    ],
  },
  {
    id: "integrations",
    slug: "integrations",
    audiences: ["CEO"],
    permission: "settings.integrations",
    path: "/settings/integrations",
    sections: [
      { id: "overview", screenshot: "integrations" },
      { id: "sms" },
      { id: "telegram", screenshot: "bot-recipients" },
      { id: "amocrm" },
      { id: "telephony" },
      { id: "faceId" },
      { id: "video" },
      { id: "onlinePayments" },
      { id: "jobs" },
    ],
  },
  {
    id: "organizations",
    slug: "organizations",
    audiences: ["CEO"],
    permission: "settings.org",
    path: "/settings/organizations",
    siteOwner: true,
    sections: [{ id: "what" }, { id: "create" }, { id: "domain" }, { id: "afterwards" }],
  },
  {
    id: "studentPortal",
    slug: "student",
    audiences: ["STUDENT", "TEACHER", "ADMIN"],
    permission: null,
    path: null,
    isPublic: true,
    sections: [
      { id: "link", screenshot: "portal" },
      { id: "family" },
      { id: "lesson", screenshot: "portal-lesson" },
      { id: "lessons" },
      { id: "homework", screenshot: "portal-homework" },
      { id: "materials" },
      { id: "money", screenshot: "portal-money" },
      { id: "results" },
      { id: "telegram" },
    ],
  },
] as const satisfies readonly HelpArticleSpec[];

/** The articles a reader may open: the site owner's one is hidden from everyone else. */
export function readableHelpArticles(siteOwner: boolean): readonly HelpArticleSpec[] {
  return HELP_ARTICLES.filter((a) => !(a as HelpArticleSpec).siteOwner || siteOwner);
}

export const HELP_ARTICLE_BY_SLUG = new Map<string, HelpArticleSpec>(
  HELP_ARTICLES.map((a) => [a.slug, a]),
);

/** Structural ids every language must provide text for. */
export type HelpSectionIds = {
  [A in HelpArticleId]: Extract<
    (typeof HELP_ARTICLES)[number],
    { id: A }
  >["sections"][number]["id"];
};
