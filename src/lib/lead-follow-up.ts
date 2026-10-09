import type { LeadContactOutcome, LeadStatus } from "@/lib/validation/leads";

/* Follow-up on leads (A-126): rules shared by the contact dialog and the server. */

/**
 * The status a contact's outcome implies. Reaching the person makes the lead
 * "Contacted" (also when it was lost or unreachable before); a missed call turns a
 * new lead into "Could not reach"; "Not interested" loses it. Staff may override.
 */
export function statusAfterContact(
  outcome: LeadContactOutcome | null,
  current: LeadStatus,
): LeadStatus {
  switch (outcome) {
    case "NOT_INTERESTED":
      return "LOST";
    case "NO_ANSWER":
    case "WRONG_NUMBER":
      return current === "NEW" ? "UNREACHABLE" : current;
    case "WILL_COME":
    case "THINKING":
    case "OTHER":
      return "CONTACTED";
    default:
      return current;
  }
}

/** Days until the next contact the dialog proposes for an outcome; null means no further date. */
export function suggestedFollowUpDays(outcome: LeadContactOutcome | null): number | null {
  switch (outcome) {
    case "NO_ANSWER":
      return 1;
    case "WILL_COME":
      return 2;
    case "THINKING":
      return 3;
    default:
      return null;
  }
}

/** `iso` shifted by `days`, as a calendar date. */
export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today as the browser sees it, "YYYY-MM-DD". */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier. */
export function dayDiff(fromIso: string, toIso: string): number {
  const ms = new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}
