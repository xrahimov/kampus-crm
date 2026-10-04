import type { SearchParams } from "@/features/settings/list-params";

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

/** Year / month / branch / payment method filters shared by the finance pages. */
export function financeParams(sp: SearchParams) {
  const now = new Date();
  const year = Number(str(sp.year));
  const month = Number(str(sp.month));
  return {
    branchId: str(sp.branchId),
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now.getFullYear(),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    paymentMethodId: str(sp.paymentMethodId),
    staffId: str(sp.staffId),
    effective: str(sp.effective) !== "0",
  };
}

export function yearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2, y - 3];
}
