import { getFormatter, getTranslations } from "next-intl/server";

import { formatDateUz, formatMoneyUz, parseDateOnly } from "@/lib/dates";
import type { CashCloseDto } from "@/server/services/finance/cash-close.service";

/** Server-rendered hand-over sheet: the day's figures by payment type and two signature lines. */
export async function CashCloseSheet({
  close,
  organizationName,
  logoUrl,
  locale,
  printedAt = new Date(),
}: {
  close: CashCloseDto;
  organizationName: string;
  logoUrl: string | null;
  locale: string;
  printedAt?: Date;
}) {
  const t = await getTranslations("cashdesk");
  const format = await getFormatter();
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
  const signed = (v: number) => (v > 0 ? `+${money(v)}` : money(v));

  const facts: Array<[string, string]> = [
    [t("sheet.date"), date(close.date)],
    [t("sheet.branch"), close.branchName],
    [t("sheet.cashier"), close.cashierName],
  ];
  const summary: Array<[string, string, string?]> = [
    [t("sheet.paymentsCount"), String(close.paymentsCount)],
    [t("sheet.received"), money(close.received)],
    [t("sheet.expectedCash"), money(close.expectedCash)],
    [t("sheet.countedCash"), money(close.countedCash)],
    [t("sheet.difference"), signed(close.difference), "sheet-difference"],
  ];

  return (
    <article
      className="mx-auto w-full max-w-2xl rounded-md border bg-white p-8 text-sm text-black print:border-0"
      data-testid="cash-close-sheet"
    >
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">{organizationName}</div>
          <h1 className="text-xl font-bold">{t("sheet.title")}</h1>
        </div>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="max-h-14" />
        )}
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-neutral-500 uppercase">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            <th className="py-1 pr-2 font-medium">{t("sheet.method")}</th>
            <th className="py-1 pr-2 text-right font-medium">{t("sheet.payments")}</th>
            <th className="py-1 pr-2 text-right font-medium">{t("sheet.income")}</th>
            <th className="py-1 pr-2 text-right font-medium">{t("sheet.refunds")}</th>
            <th className="py-1 pr-2 text-right font-medium">{t("sheet.expenses")}</th>
            <th className="py-1 text-right font-medium">{t("sheet.net")}</th>
          </tr>
        </thead>
        <tbody>
          {close.methods.map((m) => (
            <tr key={m.methodId ?? "none"} className="border-b border-neutral-200">
              <td className="py-1 pr-2">
                {m.name ?? t("noMethod")}
                {m.isCash && <span className="ml-1 text-xs text-neutral-500">({t("cash")})</span>}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{money(m.payments)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{money(m.income)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{money(m.refunds)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{money(m.expenses)}</td>
              <td className="py-1 text-right font-medium tabular-nums">{money(m.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mb-6 grid gap-1 sm:max-w-sm">
        {summary.map(([label, value, testId]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-neutral-600">{label}</dt>
            <dd className="font-medium tabular-nums" data-testid={testId}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {close.note && (
        <p className="mb-6">
          <span className="font-medium">{t("sheet.note")}:</span> {close.note}
        </p>
      )}

      <div className="mt-12 grid gap-10 sm:grid-cols-2" data-testid="sheet-signatures">
        <div>
          <div className="border-b border-black pb-8" />
          <div className="mt-1 text-xs text-neutral-600">
            {t("sheet.signatureCashier")}: {close.cashierName} · {t("sheet.signature")}
          </div>
        </div>
        <div>
          <div className="border-b border-black pb-8" />
          <div className="mt-1 text-xs text-neutral-600">
            {t("sheet.signatureAccepted")}: {close.acceptedByName ?? t("sheet.notAccepted")} ·{" "}
            {t("sheet.signature")}
          </div>
        </div>
      </div>

      <footer className="mt-8 text-xs text-neutral-500">
        {t("sheet.printedAt", { date: dateTime(printedAt) })}
      </footer>
    </article>
  );
}
