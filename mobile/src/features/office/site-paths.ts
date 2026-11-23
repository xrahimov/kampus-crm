import { useRouter, type Href } from "expo-router";
import { useState } from "react";

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

/**
 * Where a page of the site lives in the app, if the app has it. `path` is the
 * site's path without the language, as notifications, the home page's cards
 * and the menu carry it: "/students/abc", "/groups?status=ACTIVE".
 */
export function nativeRoute(path: string): Href | null {
  const [pathname = "", filter] = path.split("?");
  // The students list takes the site's filters (A-231); any other filtered list is the site's.
  if (filter) return pathname === "/students" ? studentsRoute(filter) : null;
  const parts = pathname.split("/").filter(Boolean);
  const [first, id, ...rest] = parts;
  if (rest.length > 0) return null;
  if (first === "account") return id === "salary" ? "/staff/salary" : null;
  if (id) {
    if (first === "students") return { pathname: "/staff/student/[id]", params: { id } };
    if (first === "groups") return { pathname: "/staff/group/[id]", params: { id } };
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
    case "students":
      return "/staff/students";
    case "announcements":
      return "/staff/announcements";
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

/**
 * "/students?paymentStatus=DEBTOR" as the app's list with that filter. Null if
 * the address asks for a filter or a value the app's list does not have: it
 * would show everyone, so that address stays the site's.
 */
function studentsRoute(filter: string): Href | null {
  const params: Record<string, string> = {};
  for (const pair of filter.split("&")) {
    const [key = "", raw = ""] = pair.split("=");
    const value = decodeURIComponent(raw);
    const known = STUDENT_FILTER_VALUES[key];
    if (known === undefined || !value) return null;
    if (known !== null && !known.includes(value)) return null;
    params[key] = value;
  }
  return { pathname: "/staff/students", params };
}

/**
 * Opens a page of Kampus by its site path: inside the app where the app has
 * it, on the site (already signed in, A-204) where it does not yet.
 */
export function useOpenPath(): { open: (path: string) => void; error: string | null } {
  const router = useRouter();
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const [error, setError] = useState<string | null>(null);
  const open = (path: string) => {
    setError(null);
    const route = nativeRoute(path);
    if (route) {
      router.push(route);
      return;
    }
    openOnSite(`/${locale}${path}`).catch((e: unknown) => setError(errorText(t, e)));
  };
  return { open, error };
}
