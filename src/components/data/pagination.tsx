"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function go(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    router.replace(`${pathname}?${params.toString()}`);
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>{t("pagination.range", { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          aria-label={t("pagination.previous")}
        >
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= pages}
          onClick={() => go(page + 1)}
          aria-label={t("pagination.next")}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
