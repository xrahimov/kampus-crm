/**
 * The demo centre's own names in the language of the video. The seed writes
 * them in English or Uzbek (payment methods, the stages of the leads board,
 * expense categories, the reasons students leave); a Russian video with an
 * English board reads as half translated. `dress` renames those rows, and the
 * scenes ask `named` for the name a row now has.
 *
 * Demo data only: this renames rows of whatever database the app runs on, so
 * it belongs on the throwaway databases `record-all.sh` makes.
 */
import type { Page } from "@playwright/test";

import { getJson, mutate, rows } from "../help-screenshots";

import type { Locale } from "./words";

type Names = Record<Locale, string>;

const PAYMENT_METHODS = {
  Cash: { en: "Cash", ru: "Наличные", uz: "Naqd" },
  Card: { en: "Card", ru: "Карта", uz: "Karta" },
  "Bank transfer": { en: "Bank transfer", ru: "Перечисление", uz: "Pul o‘tkazmasi" },
} satisfies Record<string, Names>;

const LEAD_COLUMNS = {
  "NEW LEADS": { en: "NEW LEADS", ru: "Новые лиды", uz: "Yangi lidlar" },
  Contacted: { en: "Contacted", ru: "Связались", uz: "Bog‘lanildi" },
  "Trial booked": { en: "Trial booked", ru: "Пробный урок", uz: "Sinov darsi" },
} satisfies Record<string, Names>;

const LEAD_SOURCES = {
  Friend: { en: "Friend", ru: "Друзья", uz: "Do‘stlar" },
  "Walk-in": { en: "Walk-in", ru: "Пришли сами", uz: "O‘zi kelgan" },
  Website: { en: "Website", ru: "Сайт", uz: "Veb-sayt" },
} satisfies Record<string, Names>;

const LEAVE_REASONS = {
  Daraja: { en: "Level", ru: "Уровень", uz: "Daraja" },
  Joylashuv: { en: "Location", ru: "Расположение", uz: "Joylashuv" },
  Narx: { en: "Price", ru: "Цена", uz: "Narx" },
  Vaqt: { en: "Time", ru: "Время", uz: "Vaqt" },
} satisfies Record<string, Names>;

const CATEGORIES = {
  Ijara: { en: "Rent", ru: "Аренда", uz: "Ijara" },
  Ichimliklar: { en: "Drinks", ru: "Напитки", uz: "Ichimliklar" },
  Kitoblar: { en: "Books", ru: "Книги", uz: "Kitoblar" },
  Boshqalar: { en: "Other", ru: "Прочее", uz: "Boshqalar" },
} satisfies Record<string, Names>;

const ALL = {
  ...PAYMENT_METHODS,
  ...LEAD_COLUMNS,
  ...LEAD_SOURCES,
  ...LEAVE_REASONS,
  ...CATEGORIES,
} satisfies Record<string, Names>;

/** What the seeded row called `seeded` is called in a video in this language. */
export function named(locale: Locale, seeded: keyof typeof ALL): string {
  return ALL[seeded][locale];
}

/** The name `current` should have in `locale`, or null when it is not one of ours or is right already. */
function wanted(table: Record<string, Names>, current: string, locale: Locale): string | null {
  const names = Object.values(table).find((n) => Object.values(n).includes(current));
  return names && names[locale] !== current ? names[locale] : null;
}

/** Renames the seeded rows into the language of the video. Safe to run again, and after another language. */
export async function dress(ceo: Page, locale: Locale): Promise<void> {
  // A rename sends the row's other fields back as they are: these routes fill in
  // a field that is left out with its default (a payment method would stop being cash).
  const rename = async <T extends { id: string; name: string }>(
    table: Record<string, Names>,
    list: T[],
    path: (id: string) => string,
    keep: Array<keyof T> = [],
  ) => {
    for (const row of list) {
      const name = wanted(table, row.name, locale);
      if (!name) continue;
      const rest = Object.fromEntries(keep.map((key) => [key, row[key]]));
      await mutate(ceo, "patch", path(row.id), { ...rest, name });
    }
  };
  type Row = { id: string; name: string };
  await rename(
    PAYMENT_METHODS,
    await rows<Row & { isActive: boolean; isCash: boolean; sortOrder: number }>(
      ceo,
      "/payment-methods",
    ),
    (id) => `/payment-methods/${id}`,
    ["isActive", "isCash", "sortOrder"],
  );
  await rename(
    LEAD_SOURCES,
    await rows<Row & { isActive: boolean }>(ceo, "/lead-sources"),
    (id) => `/lead-sources/${id}`,
    ["isActive"],
  );
  await rename(
    LEAVE_REASONS,
    await rows<Row & { kind: string; isActive: boolean }>(ceo, "/leave-reasons"),
    (id) => `/leave-reasons/${id}`,
    ["kind", "isActive"],
  );
  const year = new Date().getUTCFullYear();
  await rename(
    CATEGORIES,
    await rows<Row>(ceo, `/finance/categories?year=${year}`),
    (id) => `/finance/categories/${id}`,
  );
  for (const board of await rows<{ id: string }>(ceo, "/lead-boards")) {
    const { columns } = await getJson<{ columns: Row[] }>(ceo, `/leads?boardId=${board.id}`);
    await rename(LEAD_COLUMNS, columns, (id) => `/lead-columns/${id}`);
  }
}
