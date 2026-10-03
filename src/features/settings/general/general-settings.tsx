"use client";

import { useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import type { BranchDto } from "@/server/services/settings/branches.service";
import type { GradingSystemDto } from "@/server/services/settings/grading-systems.service";
import type { OrgSettingsDto } from "@/server/services/settings/org-settings.service";
import type { PaymentMethodDto } from "@/server/services/settings/payment-methods.service";

import { BranchesCard } from "./branches-card";
import { GradingSystemsCard } from "./grading-systems-card";
import { OrgForm } from "./org-form";
import { PaymentMethodsCard } from "./payment-methods-card";

/** EXP §8 "Markaz sozlamalari" tab, as four cards. */
export function GeneralSettings({
  settings,
  branches,
  paymentMethods,
  gradingSystems,
}: {
  settings: OrgSettingsDto;
  branches: BranchDto[];
  paymentMethods: PaymentMethodDto[];
  gradingSystems: GradingSystemDto[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-6">
      <OrgForm settings={settings} onSaved={refresh} />
      <div className="grid gap-6 xl:grid-cols-2">
        <BranchesCard branches={branches} onChanged={refresh} />
        <PaymentMethodsCard methods={paymentMethods} onChanged={refresh} />
      </div>
      <GradingSystemsCard systems={gradingSystems} onChanged={refresh} />
    </div>
  );
}
