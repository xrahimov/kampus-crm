"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { usePathname, useRouter } from "@/i18n/navigation";

/** Debounced search bound to the `q` query parameter; resets to page 1. */
export function SearchBox({ placeholder }: { placeholder?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("q") ?? "";
  const [value, setValue] = useState(current);
  // When the URL changes from elsewhere (back button, filter reset), adopt it.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setValue(current);
  }

  useEffect(() => {
    if (value === current) return;
    const handle = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(handle);
  }, [value, current, pathname, router, searchParams]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t("search")}
        className="pl-8"
        aria-label={t("search")}
      />
    </div>
  );
}
