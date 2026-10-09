import type { NotificationDto } from "@/server/services/dashboard/notifications.service";

/** Params for `notifications.kinds.<kind>`; money is formatted by the caller. */
export function notificationParams(
  n: NotificationDto,
  money: (value: number) => string,
): Record<string, string | number> {
  const p = { ...n.params };
  if ((n.kind === "PAYMENT" || n.kind === "DEBT_PROMISE_BROKEN") && typeof p.amount === "number") {
    p.amount = money(p.amount);
  }
  return p;
}
