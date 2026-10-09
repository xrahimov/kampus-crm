"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePathname, useRouter } from "@/i18n/navigation";
import type { BranchDto } from "@/server/services/settings/branches.service";
import type { GradingSystemDto } from "@/server/services/settings/grading-systems.service";
import type { OrgSettingsDto } from "@/server/services/settings/org-settings.service";
import type { PaymentMethodDto } from "@/server/services/settings/payment-methods.service";
import type { AutoSmsSettingDto } from "@/server/services/sms/auto-sms.service";

import { AutoSmsSettings } from "./auto-sms-settings";
import { BranchesCard } from "./branches-card";
import { GradingSystemsCard } from "./grading-systems-card";
import { OrgForm } from "./org-form";
import { PaymentMethodsCard } from "./payment-methods-card";

/** EXP §8 General settings: "MARKAZ SOZLAMALARI" (four cards) and "AUTO SMS SOZLAMALARI" tabs. */
export function GeneralSettings({
  settings,
  branches,
  paymentMethods,
  gradingSystems,
  autoSms,
  forms,
  tab,
}: {
  settings: OrgSettingsDto;
  branches: BranchDto[];
  paymentMethods: PaymentMethodDto[];
  gradingSystems: GradingSystemDto[];
  autoSms: AutoSmsSettingDto[];
  /** The centre's lead forms, for the public page's sign-up form (A-121). */
  forms: Array<{ id: string; name: string }>;
  tab: "center" | "sms";
}) {
  const t = useTranslations("settings.general");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "sms") params.set("tab", "sms");
    else params.delete("tab");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="center" data-testid="general-tab-center">
            {t("tabs.center")}
          </TabsTrigger>
          <TabsTrigger value="sms" data-testid="general-tab-sms">
            {t("tabs.sms")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "sms" ? (
        <AutoSmsSettings settings={autoSms} />
      ) : (
        <>
          <OrgForm settings={settings} forms={forms} onSaved={refresh} />
          <div className="grid gap-6 xl:grid-cols-2">
            <BranchesCard branches={branches} onChanged={refresh} />
            <PaymentMethodsCard methods={paymentMethods} onChanged={refresh} />
          </div>
          <GradingSystemsCard systems={gradingSystems} onChanged={refresh} />
        </>
      )}
    </div>
  );
}
