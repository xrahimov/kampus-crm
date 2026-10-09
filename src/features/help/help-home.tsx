"use client";

import {
  BookOpen,
  CalendarCheck,
  ChartColumn,
  ClipboardCheck,
  Contact,
  Funnel,
  GraduationCap,
  HandCoins,
  House,
  Building2,
  Landmark,
  Plug,
  Search,
  Settings2,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import {
  HELP_AUDIENCES,
  readableHelpArticles,
  type HelpArticleId,
  type HelpAudience,
} from "./catalog";
import type { HelpContent } from "./content";
import { HelpMarkup } from "./help-markup";
import { searchHelp } from "./search";

const ARTICLE_ICON: Record<HelpArticleId, LucideIcon> = {
  gettingStarted: Sparkles,
  dashboard: House,
  today: CalendarCheck,
  leads: Funnel,
  groups: Users,
  teaching: BookOpen,
  students: Contact,
  payments: Wallet,
  debts: HandCoins,
  exams: ClipboardCheck,
  testsAndCoins: GraduationCap,
  finance: Landmark,
  reports: ChartColumn,
  staffAndRoles: UserRound,
  settings: Settings2,
  integrations: Plug,
  organizations: Building2,
  studentPortal: Smartphone,
};

type Filter = HelpAudience | "ALL";

/**
 * The Help home: one search box over every article in the current language,
 * and the articles grouped by who they are written for. The reader's own role
 * is selected first; the rest stay a click away.
 */
export function HelpHome({
  content,
  defaultAudience,
  siteOwner = false,
}: {
  content: HelpContent;
  defaultAudience: HelpAudience;
  /** The site owner also sees the article about Settings → Organisations. */
  siteOwner?: boolean;
}) {
  const t = useTranslations("help");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(defaultAudience);
  const readable = useMemo(() => readableHelpArticles(siteOwner), [siteOwner]);
  const hits = useMemo(() => searchHelp(content, query, readable), [content, query, readable]);
  const searching = query.trim().length >= 2;

  const articles = readable.filter(
    (a) => filter === "ALL" || (a.audiences as readonly HelpAudience[]).includes(filter),
  );

  return (
    <div className="space-y-8" data-testid="help-home">
      <header className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="relative max-w-2xl">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            autoFocus
            className="h-12 pl-11 text-base shadow-sm"
            data-testid="help-search"
          />
        </div>
      </header>

      {searching ? (
        <section aria-live="polite" data-testid="help-results">
          <p className="mb-3 text-sm text-muted-foreground">
            {hits.length === 0
              ? t("noResults", { query: query.trim() })
              : t("results", { count: hits.length })}
          </p>
          <ol className="divide-y rounded-lg border bg-card">
            {hits.map((hit) => (
              <li key={`${hit.slug}-${hit.sectionId}`}>
                <Link
                  href={`/help/${hit.slug}#${hit.sectionId}`}
                  className="block px-4 py-3 hover:bg-secondary/60"
                  data-testid="help-hit"
                >
                  <span className="text-xs text-muted-foreground">{hit.articleTitle}</span>
                  <span className="block font-medium">{hit.sectionTitle}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    <HelpMarkup text={hit.snippet} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <p className="text-sm font-medium">{t("whoAreYou")}</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("whoAreYou")}>
              {[...HELP_AUDIENCES, "ALL" as const].map((a) => {
                const active = filter === a;
                return (
                  <button
                    key={a}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(a)}
                    data-testid={`help-audience-${a}`}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card text-foreground hover:bg-secondary",
                    )}
                  >
                    {a === "ALL" ? t("everyone") : content.audiences[a].title}
                  </button>
                );
              })}
            </div>
            {filter !== "ALL" && (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {content.audiences[filter].startHere}
              </p>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {articles.map((spec) => {
              const article = content.articles[spec.id];
              const Icon = ARTICLE_ICON[spec.id];
              return (
                <Link
                  key={spec.id}
                  href={`/help/${spec.slug}`}
                  className="group flex gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
                  data-testid="help-article-card"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar text-sidebar-active">
                    <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium group-hover:text-primary">
                      {article.title}
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-sm text-muted-foreground">
                      {article.summary}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {t("sectionCount", { count: spec.sections.length })}
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
