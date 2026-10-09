"use client";

import { Check, Copy, Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortalReferralDto } from "@/server/services/students/referrals.service";

/**
 * "Invite a friend" on the student's page (A-120): the student's code and, when
 * the centre has a public lead form, a link that carries it.
 */
export function ReferralCard({ referral }: { referral: PortalReferralDto }) {
  const t = useTranslations("portal.referral");
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = referral.link ?? referral.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The browser refused the clipboard; the link stays visible to select by hand.
    }
  }

  return (
    <Card data-testid="portal-referral">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{t("code")}</span>
          <span
            className="rounded-md border bg-muted px-3 py-1 font-mono text-lg font-semibold tracking-widest"
            data-testid="portal-referral-code"
          >
            {referral.code}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? t("copied") : referral.link ? t("copyLink") : t("copyCode")}
          </Button>
        </div>
        {referral.link && (
          <p className="break-all text-xs text-muted-foreground" data-testid="portal-referral-link">
            {referral.link}
          </p>
        )}
        <p className="text-sm">{t("joined", { count: referral.joined })}</p>
      </CardContent>
    </Card>
  );
}
