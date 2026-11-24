import { useRouter, type Href } from "expo-router";
import { useState } from "react";

import { FINANCE_SECTIONS } from "@/api/office-finance";
import { DEBT_FILTERS } from "@/api/office-money";
import { NATIVE_REPORTS } from "@/api/office-reports";
import { GROUP_STATUS_FILTERS, PAYMENT_STATUS_FILTERS } from "@/api/staff-students";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { can, type Me } from "@/lib/session";
import { openOnSite } from "@/lib/web";

/**
 * Who gets the centre's home (A-230): the office, that is the full view with
 * the right to the dashboard. Teachers keep their day as the first screen.
 */
export function hasHome(me: Me): boolean {
  return me.view.current === "FULL" && can(me, "dashboard.view");
}

/** The site's Settings sections the app has, by the last part of their path (A-234, A-242). */
const NATIVE_SETTINGS = new Set([
  "courses",
  "rooms",
  "days-off",
  "schools",
  "sms",
  "receipt",
  "coins",
]);

/**
 * Where a page of the site lives in the app, if the app has it. `path` is the
 * site's path without the language, as notifications, the home page's cards
 * and the menu carry it: "/students/abc", "/groups?status=ACTIVE".
 */
export function nativeRoute(path: string): Href | null {
  const [pathname = "", filter] = path.split("?");
  // The students list takes the site's filters (A-231), the leads board a board and a search
  // (A-232) and the debtors a status, a branch and a search (A-236); any other filtered list
  // is the site's.
  if (filter) {
    if (pathname === "/students") return studentsRoute(filter);
    if (pathname === "/leads") return filteredRoute("/staff/leads", filter, LEAD_FILTER_VALUES);
    // The debtors a notification points at (A-236): "to call in this branch", one student.
    if (pathname === "/debts") return filteredRoute("/staff/debts", filter, DEBT_FILTER_VALUES);
    return null;
  }
  const parts = pathname.split("/").filter(Boolean);
  const [first, id, ...rest] = parts;
  // Leads has pages of its own under it (A-232); its sources report stays the site's.
  if (first === "leads") {
    if (!id) return "/staff/leads";
    if (rest.length > 0) return null;
    return id === "calls" || id === "waitlist" || id === "inbox" ? `/staff/leads/${id}` : null;
  }
  // Settings (A-234, A-242): its list of sections, and the ones the app has. The rest are the site's.
  if (first === "settings") {
    if (!id) return "/staff/settings";
    if (rest.length > 0) return null;
    return NATIVE_SETTINGS.has(id) ? (`/staff/settings/${id}` as Href) : null;
  }
  // Finance (A-237): its page, the entries of a kind or of a category, and a month's payroll.
  if (first === "finance") {
    if (!id) return "/staff/finance";
    const [last, ...more] = rest;
    if (more.length > 0) return null;
    if (id === "costs" && last) {
      return { pathname: "/staff/finance/costs/[id]", params: { id: last } };
    }
    if (id === "salary-detail" && last && /^\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(last)) {
      return { pathname: "/staff/finance/salary/[month]", params: { month: last.slice(0, 7) } };
    }
    if (last) return null;
    return id in FINANCE_SECTIONS
      ? { pathname: "/staff/finance/[section]", params: { section: id } }
      : null;
  }
  // Reports (A-238): the list, and the reports the app shows itself. The rest are the site's.
  if (first === "reports") {
    if (!id) return "/staff/reports";
    if (rest.length > 0) return null;
    const report = NATIVE_REPORTS.find((name) => name === id);
    return report ? `/staff/reports/${report}` : null;
  }
  if (rest.length > 0) return null;
  if (first === "account") return id === "salary" ? "/staff/salary" : null;
  if (id) {
    if (first === "students") return { pathname: "/staff/student/[id]", params: { id } };
    if (first === "groups") return { pathname: "/staff/group/[id]", params: { id } };
    if (first === "teachers") return { pathname: "/staff/teachers/[id]", params: { id } };
    // One exam's page (A-235). "/staff/exams/[id]" is the exams of a group, by the group's id.
    if (first === "exams") return { pathname: "/staff/exam/[id]", params: { id } };
    return null;
  }
  switch (first) {
    case "dashboard":
      return "/staff/home";
    case "today":
      return "/staff";
    case "checking":
      return "/staff/checking";
    case "groups":
      return "/staff/groups";
    case "timetable":
      return "/staff/timetable";
    case "teachers":
      return "/staff/teachers";
    case "exams":
      return "/staff/exams";
    case "debts":
      return "/staff/debts";
    case "cashdesk":
      return "/staff/cashdesk";
    case "students":
      return "/staff/students";
    case "announcements":
      return "/staff/announcements";
    case "absences":
      return "/staff/absences";
    case "join-requests":
      return "/staff/join-requests";
    case "notifications":
      return "/staff/notifications";
    case "search":
      return "/staff/search";
    default:
      return null;
  }
}

/** The students filters the app's list takes, and the values it knows for each. */
const STUDENT_FILTER_VALUES: Record<string, readonly string[] | null> = {
  paymentStatus: PAYMENT_STATUS_FILTERS,
  groupStatus: GROUP_STATUS_FILTERS,
  archived: ["true"],
  courseId: null,
  groupId: null,
  teacherId: null,
};

/** What the app's leads board takes from an address: the board and what is searched for. */
const LEAD_FILTER_VALUES: Record<string, readonly string[] | null> = { boardId: null, q: null };

/** What the app's debtors list takes from an address. */
const DEBT_FILTER_VALUES: Record<string, readonly string[] | null> = {
  status: DEBT_FILTERS,
  branchId: null,
  q: null,
};

/**
 * "/students?paymentStatus=DEBTOR" as the app's list with that filter. Null if
 * the address asks for a filter or a value the app's list does not have: it
 * would show everyone, so that address stays the site's.
 */
function studentsRoute(filter: string): Href | null {
  return filteredRoute("/staff/students", filter, STUDENT_FILTER_VALUES);
}

function filteredRoute(
  pathname: "/staff/students" | "/staff/leads" | "/staff/debts",
  filter: string,
  values: Record<string, readonly string[] | null>,
): Href | null {
  const params: Record<string, string> = {};
  for (const pair of filter.split("&")) {
    const [key = "", raw = ""] = pair.split("=");
    const value = decodeURIComponent(raw);
    const known = values[key];
    if (known === undefined || !value) return null;
    if (known !== null && !known.includes(value)) return null;
    params[key] = value;
  }
  return { pathname, params };
}

/**
 * Opens a page of Kampus by its site path: inside the app where the app has
 * it, on the site (already signed in, A-204) where it does not yet.
 */
export function useOpenPath(): { open: (path: string) => void; error: string | null } {
  const router = useRouter();
  const site = useOpenSite();
  const open = (path: string) => {
    const route = nativeRoute(path);
    if (route) router.push(route);
    else site.open(path);
  };
  return { open, error: site.error };
}

/**
 * Opens a page on the site even where the app has that page: for what only
 * the site does there, such as the Excel file of a month's payroll.
 */
export function useOpenSite(): { open: (path: string) => void; error: string | null } {
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const [error, setError] = useState<string | null>(null);
  const open = (path: string) => {
    setError(null);
    openOnSite(`/${locale}${path}`).catch((e: unknown) => setError(errorText(t, e)));
  };
  return { open, error };
}
