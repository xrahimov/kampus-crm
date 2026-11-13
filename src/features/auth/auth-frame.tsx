import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { KampusWordmark } from "@/components/brand/logo";
import { TileWall } from "@/components/brand/tile-wall";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { organizationForHost } from "@/server/services/settings/domains.service";

/** The centre whose own address this request came in on, if any (A-114). */
export async function brandForRequest() {
  const h = await headers();
  return organizationForHost(h.get("x-forwarded-host") ?? h.get("host"));
}

/**
 * The frame of the pages outside the app shell (sign-in, change password): the
 * lapis panel states what Kampus is, the porcelain side holds the form. On
 * narrow screens the panel collapses to the wordmark. The panel is a tiled
 * wall that is uncovered when the page opens and lights up under the pointer,
 * and the name and the form settle into place once (A-192).
 */
export async function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  // On a centre's own address the page carries the centre's name (A-114).
  const brand = await brandForRequest();
  const name = brand?.name ?? t("app.name");

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="relative hidden flex-col justify-end overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <TileWall id="login-wall" />
        <div
          className="pointer-events-none relative z-10 max-w-sm animate-rise [animation-delay:500ms]"
          data-testid="login-brand"
        >
          {brand?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt=""
              className="mb-6 max-h-16 w-auto rounded-md bg-white/90 p-2"
            />
          )}
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">{name}</h2>
          <p className="mt-3 text-lg text-sidebar-foreground">
            {brand ? t("app.poweredBy") : t("app.tagline")}
          </p>
        </div>
      </section>

      <section className="flex min-h-screen flex-col px-6 py-6 lg:min-h-0 lg:px-16">
        <div className="flex items-center justify-between">
          <KampusWordmark name={name} className="lg:invisible" />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-rise [animation-delay:150ms]">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
