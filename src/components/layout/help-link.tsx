"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** The sidebar's last row: the in-app manuals. Sits under the module list, in the same style. */
export function HelpLink({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("help");
  const pathname = usePathname();
  const active = pathname === "/help" || pathname.startsWith("/help/");
  return (
    <div className="border-t border-white/10 px-3 py-2">
      <Link
        href="/help"
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        data-testid="nav-help"
        className={cn(
          "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
          "before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:transition-colors",
          active
            ? "bg-sidebar-muted font-medium text-white before:bg-sidebar-active"
            : "text-sidebar-foreground before:bg-transparent hover:bg-sidebar-muted/70 hover:text-white",
        )}
      >
        <CircleHelp
          className={cn("size-[18px] shrink-0", active ? "text-sidebar-active" : "opacity-80")}
          strokeWidth={1.75}
        />
        <span className="truncate">{t("nav")}</span>
      </Link>
    </div>
  );
}
