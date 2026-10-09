import { getFormatter, getTranslations } from "next-intl/server";

import { formatDateUz, formatMoneyUz, parseDateOnly } from "@/lib/dates";
import type { ReceiptField } from "@/lib/validation/students";
import type { ReceiptDto } from "@/server/services/students/payments.service";

/** Server-rendered receipt body shared by the print page and the settings preview. */
export async function Receipt({
  receipt,
  qr,
  fiscalQr = null,
  locale,
  printedAt = new Date(),
}: {
  receipt: ReceiptDto;
  qr: string | null;
  /** QR of the OFD provider's receipt page, when the sale was fiscalised (A-147). */
  fiscalQr?: string | null;
  locale: string;
  printedAt?: Date;
}) {
  const t = await getTranslations("payments.receipt");
  const format = await getFormatter();
  const show = (f: ReceiptField) => receipt.settings.visibleFields.includes(f);
  const money = (v: number) =>
    locale === "uz"
      ? formatMoneyUz(v)
      : format.number(v, { style: "currency", currency: "UZS", maximumFractionDigits: 0 });
  const date = (iso: string) =>
    locale === "uz"
      ? formatDateUz(parseDateOnly(iso), { dateStyle: "medium" })
      : format.dateTime(parseDateOnly(iso), { dateStyle: "medium", timeZone: "UTC" });
  const dateTime = (d: Date) =>
    locale === "uz"
      ? formatDateUz(d, { dateStyle: "medium", timeStyle: "short" })
      : format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  const logo =
    show("logo") && receipt.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={receipt.logoUrl} alt="" className="mx-auto max-h-16" />
    ) : null;

  const rows: Array<[ReceiptField, string, string]> = [
    ["paymentId", t("paymentId"), receipt.id],
    ["student", t("student"), receipt.studentName],
    ["group", t("group"), receipt.groupName],
    ["teacher", t("teacher"), receipt.teacherName ?? "—"],
    ["coursePrice", t("coursePrice"), money(receipt.coursePrice)],
    ["method", t("method"), receipt.methodName ?? "—"],
    ["paidAt", t("paidAt"), date(receipt.paidAt)],
    ["paidAt", t("effectiveMonth"), date(receipt.effectiveMonth)],
    ["cashier", t("cashier"), receipt.receivedByName ?? "—"],
  ];

  return (
    <article
      className="mx-auto w-full max-w-sm rounded-md border bg-white p-6 text-sm text-black print:border-0"
      data-testid="receipt"
    >
      {receipt.settings.logoPosition === "TOP" && logo}
      {show("header") && (
        <header className="mb-4 text-center">
          <h1 className="text-lg font-bold uppercase tracking-wide">{t("title")}</h1>
          <p className="font-medium">{receipt.organizationName}</p>
          {show("address") && receipt.settings.address && <p>{receipt.settings.address}</p>}
          {show("phone") && receipt.settings.phone && <p>{receipt.settings.phone}</p>}
        </header>
      )}
      <dl className="divide-y">
        {rows
          .filter(([f]) => show(f))
          .map(([, k, v], i) => (
            <div key={`${k}-${i}`} className="flex justify-between gap-3 py-1">
              <dt className="text-neutral-600">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
      </dl>
      {show("amount") && (
        <p className="mt-4 flex justify-between border-t pt-3 text-base font-bold">
          <span>{t("amount")}</span>
          <span data-testid="receipt-amount">{money(receipt.amount)}</span>
        </p>
      )}
      {show("qr") && qr && (
        <div
          className="mx-auto mt-4 size-24 [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}
      {receipt.fiscal?.status === "ISSUED" && (
        <section className="mt-4 border-t pt-3 text-xs" data-testid="receipt-fiscal">
          <p className="mb-1 text-center font-semibold uppercase tracking-wide">
            {t("fiscalTitle")}
          </p>
          <dl className="divide-y">
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-neutral-600">{t("fiscalNumber")}</dt>
              <dd className="text-right font-medium">{receipt.fiscal.externalId ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-neutral-600">{t("fiscalSign")}</dt>
              <dd className="text-right font-mono font-medium" data-testid="receipt-fiscal-sign">
                {receipt.fiscal.fiscalSign ?? "—"}
              </dd>
            </div>
          </dl>
          {fiscalQr && (
            <div
              className="mx-auto mt-2 size-20 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: fiscalQr }}
            />
          )}
        </section>
      )}
      {show("footer") && (
        <footer className="mt-4 text-center text-xs text-neutral-600">
          {show("footerText") && receipt.settings.footerText ? (
            <p>{receipt.settings.footerText}</p>
          ) : (
            <p>{t("thanks")}</p>
          )}
          {show("printedAt") && (
            <p>
              {t("printedAt")}: {dateTime(printedAt)}
            </p>
          )}
        </footer>
      )}
      {receipt.settings.logoPosition === "BOTTOM" && logo}
    </article>
  );
}
