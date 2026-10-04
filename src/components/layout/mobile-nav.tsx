"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { KampusWordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { MainNav } from "./main-nav";

/** Below the lg breakpoint the sidebar folds into a left drawer behind this button. */
export function MobileNav({ permissions, appName }: { permissions: string[]; appName: string }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")}>
          <Menu />
        </Button>
      </DialogTrigger>
      <DialogContent
        side="left"
        className="flex w-72 flex-col gap-0 border-0 bg-sidebar p-0 text-sidebar-foreground"
      >
        <DialogTitle className="sr-only">{t("openMenu")}</DialogTitle>
        <div className="flex h-14 items-center px-5 text-white">
          <KampusWordmark name={appName} />
        </div>
        <MainNav permissions={permissions} onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
