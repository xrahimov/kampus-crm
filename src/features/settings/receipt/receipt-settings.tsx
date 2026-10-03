"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedGroup, SegmentedItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { RECEIPT_FIELDS, type ReceiptField } from "@/lib/validation/students";
import type { ReceiptSettingsDto } from "@/server/services/settings/receipt-settings.service";

/** EXP §8 "Chek sozlamalari": address, phone, visible parts, logo position, footer, preview. */
export function ReceiptSettings({ settings }: { settings: ReceiptSettingsDto }) {
  const t = useTranslations();
  const tr = useTranslations("settings.receipt");
  const [form, setForm] = useState({
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    visibleFields: settings.visibleFields as ReceiptField[],
    logoPosition: settings.logoPosition,
    footerText: settings.footerText ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = (f: ReceiptField) => form.visibleFields.includes(f);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await api("/settings/receipt", {
        method: "PUT",
        body: {
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          visibleFields: form.visibleFields,
          logoPosition: form.logoPosition,
          footerText: form.footerText.trim() || null,
        },
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const sampleRows: Array<[ReceiptField, string, string]> = [
    ["paymentId", t("payments.receipt.paymentId"), "pay_000001"],
    ["student", t("payments.receipt.student"), "<student name>"],
    ["group", t("payments.receipt.group"), "<group>"],
    ["teacher", t("payments.receipt.teacher"), "<teacher>"],
    ["coursePrice", t("payments.receipt.coursePrice"), "500 000"],
    ["method", t("payments.receipt.method"), "<method>"],
    ["paidAt", t("payments.receipt.paidAt"), "2026-10-03"],
    ["cashier", t("payments.receipt.cashier"), "<cashier>"],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <form onSubmit={submit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{tr("title")}</CardTitle>
            <CardDescription>{tr("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">{t.has(error) ? t(error) : t("errors.internal")}</Alert>
            )}
            {saved && (
              <Alert variant="success" data-testid="receipt-saved">
                {t("common.saved")}
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="receipt-address">{tr("address")}</Label>
                <Input
                  id="receipt-address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-phone">{tr("phone")}</Label>
                <Input
                  id="receipt-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{tr("visibleFields")}</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {RECEIPT_FIELDS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={show(f)}
                      onCheckedChange={(v) =>
                        setForm((s) => ({
                          ...s,
                          visibleFields: v
                            ? [...s.visibleFields, f]
                            : s.visibleFields.filter((x) => x !== f),
                        }))
                      }
                      data-testid={`receipt-field-${f}`}
                    />
                    {tr(`fields.${f}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label>{tr("logoPosition")}</Label>
              <SegmentedGroup
                value={form.logoPosition}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, logoPosition: v as "TOP" | "BOTTOM" }))
                }
                aria-label={tr("logoPosition")}
              >
                <SegmentedItem value="TOP" id="logo-top">
                  {tr("TOP")}
                </SegmentedItem>
                <SegmentedItem value="BOTTOM" id="logo-bottom">
                  {tr("BOTTOM")}
                </SegmentedItem>
              </SegmentedGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-footer">{tr("footerText")}</Label>
              <Textarea
                id="receipt-footer"
                rows={2}
                value={form.footerText}
                onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{tr("preview")}</CardTitle>
        </CardHeader>
        <CardContent>
          <article
            className="rounded-md border bg-white p-4 text-sm text-black"
            data-testid="receipt-preview"
          >
            {form.logoPosition === "TOP" && show("logo") && settings.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="" className="mx-auto mb-2 max-h-12" />
            )}
            {show("header") && (
              <header className="mb-3 text-center">
                <p className="font-bold uppercase">{t("payments.receipt.title")}</p>
                <p>{settings.organizationName}</p>
                {show("address") && form.address && <p>{form.address}</p>}
                {show("phone") && form.phone && <p>{form.phone}</p>}
              </header>
            )}
            <dl className="divide-y">
              {sampleRows
                .filter(([f]) => show(f))
                .map(([f, k, v]) => (
                  <div key={f} className="flex justify-between gap-2 py-1">
                    <dt className="text-neutral-600">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
            {show("amount") && (
              <p className="mt-3 flex justify-between border-t pt-2 font-bold">
                <span>{t("payments.receipt.amount")}</span>
                <span>500 000</span>
              </p>
            )}
            {show("qr") && (
              <div className="mx-auto mt-3 size-16 rounded border border-dashed" aria-hidden />
            )}
            {show("footer") && (
              <footer className="mt-3 text-center text-xs text-neutral-600">
                <p>
                  {show("footerText") && form.footerText
                    ? form.footerText
                    : t("payments.receipt.thanks")}
                </p>
                {show("printedAt") && <p>{t("payments.receipt.printedAt")}: 2026-10-03 12:00</p>}
              </footer>
            )}
            {form.logoPosition === "BOTTOM" && show("logo") && settings.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="" className="mx-auto mt-2 max-h-12" />
            )}
          </article>
        </CardContent>
      </Card>
    </div>
  );
}
