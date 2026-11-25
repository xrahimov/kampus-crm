import { getTranslations } from "next-intl/server";

import { KampusWordmark } from "@/components/brand/logo";
import { locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/*
 * The frame of the two pages the app stores link to (A-267): the privacy policy
 * and "Delete your account". Plain reading pages, open to anyone, in the site's
 * three languages; the store's reviewers read the English one.
 */

/** The address the pages name for questions; set on the server, absent until then. */
export function legalContactEmail(): string | null {
  const value = (process.env.LEGAL_CONTACT_EMAIL ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export async function LegalDocument({
  locale,
  path,
  title,
  intro,
  testId,
  children,
}: {
  locale: string;
  /** The page's own path without the language, for the language links. */
  path: "/privacy" | "/delete-account";
  title: string;
  intro: string;
  testId: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations({ locale });
  return (
    <article className="mx-auto w-full max-w-2xl" data-testid={testId}>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b pb-5">
        <KampusWordmark name={t("app.name")} />
        <nav aria-label={t("legal.languages")} className="flex gap-1 text-sm">
          {locales.map((code) => (
            // A plain link: the page is read again from the server in the other language.
            <a
              key={code}
              href={`/${code}${path}`}
              hrefLang={code}
              aria-current={code === locale ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                code === locale && "bg-muted font-medium text-foreground",
              )}
            >
              {t(`locales.${code}`)}
            </a>
          ))}
        </nav>
      </header>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("legal.updated")}</p>
      <p className="mt-6 text-base leading-7 text-pretty">{intro}</p>
      <div className="mt-8 space-y-9">{children}</div>
    </article>
  );
}

/** One headed part of a page: a paragraph, a list, or both. */
export function LegalSection({
  title,
  text,
  points,
  ordered = false,
  children,
}: {
  title: string;
  text?: string;
  points?: string[];
  /** Steps to follow in order get numbers; everything else gets marks. */
  ordered?: boolean;
  children?: React.ReactNode;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {text ? <p className="leading-7 text-pretty text-foreground/90">{text}</p> : null}
      {points && points.length > 0 ? (
        <List
          className={cn(
            "space-y-2 pl-5 leading-7 text-foreground/90 marker:text-muted-foreground",
            ordered ? "list-decimal" : "list-disc",
          )}
        >
          {points.map((point) => (
            <li key={point} className="pl-1 text-pretty">
              {point}
            </li>
          ))}
        </List>
      ) : null}
      {children}
    </section>
  );
}

/** A sentence of the messages with the contact address in it, the address as a link to write to. */
export function ContactSentence({
  sentence,
  email,
  testId,
}: {
  /** The sentence with `{email}` already replaced by the address. */
  sentence: string;
  email: string;
  testId?: string;
}) {
  const at = email ? sentence.indexOf(email) : -1;
  return (
    <p className="leading-7 text-pretty text-foreground/90" data-testid={testId}>
      {at < 0 ? (
        sentence
      ) : (
        <>
          {sentence.slice(0, at)}
          <a className="font-medium underline underline-offset-4" href={`mailto:${email}`}>
            {email}
          </a>
          {sentence.slice(at + email.length)}
        </>
      )}
    </p>
  );
}
