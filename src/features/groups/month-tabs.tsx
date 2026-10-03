"use client";

import { useFormatter } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from "@/i18n/navigation";

/** Course months as tabs bound to `?month=YYYY-MM` (EXP §5 "Sentabr 2026 … May 2027"). */
export function MonthTabs({ months, current }: { months: string[]; current: string }) {
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const all = months.includes(current) ? months : [...months, current].sort();

  function go(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={go}>
      <TabsList className="h-auto flex-wrap border-0">
        {all.map((m) => (
          <TabsTrigger key={m} value={m} className="h-8 text-xs" data-testid={`month-${m}`}>
            {format.dateTime(
              new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 15)),
              {
                month: "short",
                year: "numeric",
              },
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
