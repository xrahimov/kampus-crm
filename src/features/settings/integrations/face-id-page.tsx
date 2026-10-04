"use client";

import { useTranslations } from "next-intl";

import type { IntegrationDto } from "@/server/services/integrations/integrations.service";

import { IntegrationForm, WebhookHint } from "./integration-form";

/** Settings → FaceID (EXP §8, NOT VERIFIED there): terminal webhook and the lateness grace (A-87). */
export function FaceIdPage({ dto }: { dto: IntegrationDto }) {
  const t = useTranslations("integrations.FACE_ID");
  return (
    <IntegrationForm
      provider="FACE_ID"
      dto={dto}
      fields={[
        { key: "webhookSecret", secret: true },
        { key: "lateAfterMinutes", type: "number" },
      ]}
      extra={
        <div className="space-y-1">
          <WebhookHint path="face-id" />
          <p className="text-xs text-muted-foreground">{t("payloadHint")}</p>
        </div>
      }
      testId="integration-face-id"
    />
  );
}
