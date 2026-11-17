/**
 * The demo centre's own names in the language of the video. The seed writes
 * them in English or Uzbek (payment methods, the stages of the leads board,
 * expense categories, the reasons students leave); a Russian video with an
 * English board reads as half translated. `dress` renames those rows, and the
 * scenes ask `named` for the name a row now has.
 *
 * Some words have no page that changes them: a note on a lead, the comment of
 * a payment, a notification already sent. Those are rewritten in the database
 * itself, and only in the one named in VIDEO_DATABASE_URL: `record-all.sh`
 * names there the throwaway database it has just made. Without it they stay
 * as the seed wrote them.
 *
 * `SPOKEN` is what the centre's people write to each other in the rows the
 * recorder adds (a post, the chat, a poll). The course is English, so the
 * tasks and the students' answers stay English in every video.
 *
 * Demo data only: this renames rows of whatever database the app runs on, so
 * it belongs on the throwaway databases `record-all.sh` makes.
 */
import type { Page } from "@playwright/test";
import { Client } from "pg";

import { DEMO, getJson, mutate, rows } from "../help-screenshots";

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

/** What teachers, students and administrators write to each other, in the language of the video. */
export const SPOKEN = {
  en: {
    post: DEMO.post,
    comment: DEMO.comment,
    chatTeacher: DEMO.chatTeacher,
    chatStudent: DEMO.chatStudent,
    packages: DEMO.packages,
    callChat: DEMO.callChat,
    callReply: DEMO.callReply,
    poll: DEMO.poll,
  },
  ru: {
    post: "На этой неделе начинаем Unit 3: распорядок дня. В четверг принесите рабочую тетрадь; слайды лежат в материалах группы.",
    comment: "В субботу будет тест?",
    chatTeacher:
      "Всем привет! Домашнее задание на четверг открыто. Пишите сюда, если что-то непонятно.",
    chatStudent: "Спасибо! Упражнение 4 тоже на четверг?",
    packages: ["8 уроков", "12 уроков"],
    callChat: "Откройте, пожалуйста, страницу 12",
    callReply: "Готово!",
    poll: { question: "Готовы к тесту?", options: ["Да", "Пока нет"] },
  },
  uz: {
    post: "Bu hafta Unit 3 ni boshlaymiz: kundalik ishlar. Payshanba kuni ish daftaringizni olib keling; slaydlar guruh materiallarida.",
    comment: "Shanba kuni test bo‘ladimi?",
    chatTeacher:
      "Hammaga salom! Payshanba kungi uy vazifasi ochiq. Tushunarsiz joyi bo‘lsa, shu yerga yozing.",
    chatStudent: "Rahmat! 4-mashq ham payshanbagami?",
    packages: ["8 ta dars", "12 ta dars"],
    callChat: "12-betni oching, iltimos",
    callReply: "Tayyor!",
    poll: { question: "Testga tayyormisiz?", options: ["Ha", "Hali yo‘q"] },
  },
} satisfies Record<
  Locale,
  Pick<
    typeof DEMO,
    | "post"
    | "comment"
    | "chatTeacher"
    | "chatStudent"
    | "packages"
    | "callChat"
    | "callReply"
    | "poll"
  >
>;

/** Notes the seed wrote in English (one in Uzbek), as they read in each video. */
const NOTES = {
  "Asked about the morning group": {
    en: "Asked about the morning group",
    ru: "Интересуется утренней группой",
    uz: "Ertalabki guruh haqida so‘radi",
  },
  "Trial lesson on Thursday": {
    en: "Trial lesson on Thursday",
    ru: "Пробный урок в четверг",
    uz: "Payshanba kuni sinov darsi",
  },
  "Partial payment": { en: "Partial payment", ru: "Частичная оплата", uz: "Qisman to‘lov" },
  "Office rent": { en: "Office rent", ru: "Аренда офиса", uz: "Ofis ijarasi" },
  "Course books": { en: "Course books", ru: "Учебники", uz: "Darsliklar" },
  Vending: { en: "Vending", ru: "Автомат с напитками", uz: "Ichimliklar avtomati" },
  "Advance on salary": { en: "Advance on salary", ru: "Аванс по зарплате", uz: "Maoshdan avans" },
  "Instagram ads": { en: "Instagram ads", ru: "Реклама в Instagram", uz: "Instagram reklamasi" },
  "Best retention": {
    en: "Best retention",
    ru: "Лучше всех удержал учеников",
    uz: "O‘quvchilarni eng yaxshi saqlab qoldi",
  },
  "Late twice": { en: "Late twice", ru: "Два опоздания", uz: "Ikki marta kechikdi" },
  "Seed capital": { en: "Seed capital", ru: "Стартовый капитал", uz: "Boshlang‘ich kapital" },
  "Website form": { en: "Website form", ru: "Форма на сайте", uz: "Saytdagi forma" },
  "Demo course": { en: "Demo course", ru: "Демо-курс", uz: "Demo kurs" },
  "Darsda faol qatnashdi": {
    en: "Active in class",
    ru: "Активно работал на уроке",
    uz: "Darsda faol qatnashdi",
  },
} satisfies Record<string, Names>;

/**
 * Words kept in the database that no page changes: [table, column, the words]. A column
 * written as "params.column" is one key of a JSON column.
 */
const STORED: Array<[table: string, column: string, words: Record<string, Names>]> = [
  ["Lead", "comment", NOTES],
  ["Payment", "comment", NOTES],
  ["FinanceEntry", "comment", NOTES],
  ["CoinTransaction", "comment", NOTES],
  ["LeadForm", "name", NOTES],
  ["Course", "description", NOTES],
  // The seed's board is named after the source its leads come from.
  ["LeadBoard", "name", { Website: LEAD_SOURCES.Website }],
  ["Notification", "params.column", LEAD_COLUMNS],
  ["Notification", "params.source", LEAD_SOURCES],
  ["GroupMembership", "leaveReason", LEAVE_REASONS],
  ["GroupMembership", "note", LEAVE_REASONS],
];

/** Rewrites the stored words in the recording's own database; does nothing when none is named. */
async function dressStored(locale: Locale): Promise<void> {
  const url = process.env.VIDEO_DATABASE_URL;
  if (!url) return;
  const client = new Client({ connectionString: url.split("?")[0] });
  await client.connect();
  try {
    for (const [table, column, words] of STORED) {
      const [field, key] = column.split(".");
      for (const names of Object.values(words)) {
        const others = Object.values(names).filter((name) => name !== names[locale]);
        if (others.length === 0) continue;
        await client.query(
          key
            ? `UPDATE "${table}" SET "${field}" = jsonb_set("${field}", '{${key}}', to_jsonb($2::text)) WHERE "${field}"->>'${key}' = ANY($1)`
            : `UPDATE "${table}" SET "${field}" = $2 WHERE "${field}" = ANY($1)`,
          [others, names[locale]],
        );
      }
    }
  } finally {
    await client.end();
  }
}

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
  await dressStored(locale);
}
