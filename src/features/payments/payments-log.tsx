"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Pagination } from "@/components/data/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { Page } from "@/lib/validation/common";
import type { PaymentDto } from "@/server/services/students/payments.service";

import { PaymentsTable } from "./payments-table";

const ALL = "__all";

/** Settings → "To'lovlar" (EXP §8): the organisation-wide payments log (A-64). */
export function PaymentsLog({
  page,
  filters,
  methods,
  cashiers,
}: {
  page: Page<PaymentDto> & { totalAmount: number };
  filters: { from?: string; to?: string; paymentMethodId?: string; receivedById?: string };
  methods: Array<{ id: string; name: string }>;
  cashiers: Array<{ id: string; fullName: string }>;
}) {
  const t = useTranslations();
  const tl = useTranslations("payments.log");
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tl("title")}</CardTitle>
        <CardDescription>{tl("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="log-from" className="text-xs text-muted-foreground">
              {tl("from")}
            </Label>
            <Input
              id="log-from"
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => setParam("from", e.target.value || null)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="log-to" className="text-xs text-muted-foreground">
              {tl("to")}
            </Label>
            <Input
              id="log-to"
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => setParam("to", e.target.value || null)}
            />
          </div>
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">{tl("method")}</Label>
            <Select
              value={filters.paymentMethodId ?? ALL}
              onValueChange={(v) => setParam("paymentMethodId", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tl("all")}</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">{tl("cashier")}</Label>
            <Select
              value={filters.receivedById ?? ALL}
              onValueChange={(v) => setParam("receivedById", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tl("all")}</SelectItem>
                {cashiers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p
            className="ml-auto text-sm text-muted-foreground tabular-nums"
            data-testid="payments-total"
          >
            {t("payments.history.total", { amount: money(page.totalAmount) })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <PaymentsTable payments={page.items} showStudent />
        </div>
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
      </CardContent>
    </Card>
  );
}
