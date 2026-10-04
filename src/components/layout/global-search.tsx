"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { SearchResultsDto } from "@/server/services/dashboard/search.service";

type Hit = {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  group: "students" | "leads" | "groups";
};

/** EXP §0 header "Qidirish...": one box over students, leads and groups (A-98). */
export function GlobalSearch() {
  const t = useTranslations("search");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResultsDto | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      api<SearchResultsDto>(`/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => {
          setResults(r);
          setActive(0);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const hits: Hit[] =
    term.length < 2 || !results
      ? []
      : [
          ...results.students.map((s) => ({
            key: `s-${s.id}`,
            href: `/students/${s.id}`,
            title: s.fullName,
            subtitle: [s.phone, s.groups.join(", ")].filter(Boolean).join(" · "),
            group: "students" as const,
          })),
          ...results.leads.map((l) => ({
            key: `l-${l.id}`,
            href: `/leads?boardId=${l.boardId}&q=${encodeURIComponent(l.fullName)}`,
            title: l.fullName,
            subtitle: [l.phone, l.columnName].filter(Boolean).join(" · "),
            group: "leads" as const,
          })),
          ...results.groups.map((g) => ({
            key: `g-${g.id}`,
            href: `/groups/${g.id}`,
            title: g.name,
            subtitle: [g.courseName, g.teacherName].filter(Boolean).join(" · "),
            group: "groups" as const,
          })),
        ];

  function go(hit: Hit) {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  }

  return (
    <div ref={boxRef} className="relative ml-2 hidden md:block">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            go(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        className="h-9 w-56 border-transparent bg-secondary pl-8 hover:bg-muted focus-visible:bg-card lg:w-80"
        data-testid="global-search"
      />
      {open && term.length >= 2 && (
        <div
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          data-testid="global-search-results"
          role="listbox"
        >
          {hits.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {results ? t("empty") : t("searching")}
            </p>
          ) : (
            (["students", "leads", "groups"] as const).map((group) => {
              const rows = hits.filter((h) => h.group === group);
              if (rows.length === 0) return null;
              return (
                <div key={group} className="py-1">
                  <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                    {t(`groups.${group}`)}
                  </p>
                  {rows.map((h) => {
                    const index = hits.indexOf(h);
                    return (
                      <button
                        key={h.key}
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(h)}
                        className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm ${index === active ? "bg-accent" : "hover:bg-accent/60"}`}
                        data-testid="search-hit"
                      >
                        <span className="font-medium">{h.title}</span>
                        {h.subtitle && (
                          <span className="text-xs text-muted-foreground">{h.subtitle}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
