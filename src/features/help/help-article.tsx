import { ArrowLeft, ArrowRight, ExternalLink, Lightbulb } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import type { HelpArticleSpec } from "./catalog";
import type { HelpArticleText, HelpBlock, HelpContent, HelpSectionText } from "./content";
import { HelpMarkup } from "./help-markup";
import { HelpScreenshot } from "./help-screenshot";

type AnyArticleText = HelpArticleText<HelpArticleSpec["id"]>;

function Block({ block }: { block: HelpBlock }) {
  if (typeof block === "string") {
    return (
      <p className="leading-relaxed">
        <HelpMarkup text={block} />
      </p>
    );
  }
  if ("steps" in block) {
    return (
      <ol className="space-y-2 pl-1">
        {block.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
              {i + 1}
            </span>
            <span className="leading-relaxed">
              <HelpMarkup text={step} />
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <aside className="flex gap-3 rounded-md border-l-[3px] border-saffron bg-saffron/10 px-4 py-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-saffron-foreground" aria-hidden />
      <p className="leading-relaxed">
        <HelpMarkup text={block.note} />
      </p>
    </aside>
  );
}

/**
 * One manual article: the sections in order with their screenshots, a sticky
 * "on this page" list on wide screens, and previous / next links. Used inside
 * the app (`/help/<slug>`) and on the student's page (`/class/<token>/help`).
 */
export async function HelpArticle({
  locale,
  spec,
  content,
  homeHref,
  previous,
  next,
}: {
  locale: string;
  spec: HelpArticleSpec;
  content: HelpContent;
  /** Where "All manuals" goes. */
  homeHref: string;
  previous?: { href: string; title: string };
  next?: { href: string; title: string };
}) {
  const t = await getTranslations("help");
  const text = content.articles[spec.id] as AnyArticleText;
  const texts = text.sections as Record<string, HelpSectionText>;
  const sections = spec.sections.map((s) => ({ ...s, text: texts[s.id]! }));
  const audiences = spec.audiences.map((a) => content.audiences[a].title).join(", ");

  return (
    <div className="space-y-6" data-testid="help-article">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={homeHref}>
          <ArrowLeft /> {t("allManuals")}
        </Link>
      </Button>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
        <article className="min-w-0 max-w-3xl">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">{text.title}</h1>
            <p className="mt-2 text-base text-muted-foreground">{text.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{t("writtenFor", { roles: audiences })}</span>
              {spec.path && (
                <Link
                  href={spec.path}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {t("openPage")} <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </header>

          <div className="space-y-10">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-20 space-y-3"
                data-testid="help-section"
              >
                <h2 className="text-xl font-semibold tracking-tight">{section.text.title}</h2>
                {section.screenshot && (
                  <HelpScreenshot
                    locale={locale}
                    name={section.screenshot}
                    caption={section.text.title}
                  />
                )}
                {section.text.body.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </section>
            ))}
          </div>

          {(previous || next) && (
            <nav
              aria-label={t("neighbours")}
              className="mt-12 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:justify-between"
            >
              {previous ? (
                <Link
                  href={previous.href}
                  className="group inline-flex items-center gap-2 text-sm hover:text-primary"
                >
                  <ArrowLeft className="size-4 text-muted-foreground group-hover:text-primary" />
                  <span>
                    <span className="block text-xs text-muted-foreground">{t("previous")}</span>
                    <span className="font-medium">{previous.title}</span>
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={next.href}
                  className="group inline-flex items-center gap-2 text-sm hover:text-primary sm:text-right"
                >
                  <span>
                    <span className="block text-xs text-muted-foreground">{t("next")}</span>
                    <span className="font-medium">{next.title}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" />
                </Link>
              )}
            </nav>
          )}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("onThisPage")}</p>
            <ol className="space-y-1 border-l">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-sm text-muted-foreground hover:border-sidebar-active hover:text-foreground"
                  >
                    {section.text.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
