import { z } from "zod";

import { idSchema } from "./common";

/* Coins and marketplace (EXP §5 COINLAR, §8 Coin sozlamalari, §10 Coins). Messages are i18n keys. */

export const COIN_EVENTS = ["ATTENDANCE", "HOMEWORK", "TEST_RESULT", "BIRTHDAY"] as const;
export type CoinEvent = (typeof COIN_EVENTS)[number];

export const PURCHASE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

const text = (max: number) => z.string().trim().min(1, "validation.required").max(max);
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
const coins = z.coerce.number().int("validation.integer").min(1, "validation.min").max(100_000);

/** PUT /settings/coins: the switch and every rule row. */
export const coinSettingsSchema = z.object({
  autoCoins: z.boolean(),
  rules: z
    .array(
      z.object({
        event: z.enum(COIN_EVENTS),
        amount: coins,
        isActive: z.boolean(),
      }),
    )
    .max(COIN_EVENTS.length),
});
export type CoinSettingsInput = z.output<typeof coinSettingsSchema>;

/** "Sabab qo'shish": name, cap, active. */
export const coinReasonSchema = z.object({
  name: text(80),
  maxCoins: coins,
  isActive: z.boolean().default(true),
});
export type CoinReasonInput = z.output<typeof coinReasonSchema>;

/** "Coin berish" from a group's COINLAR tab. */
export const giveCoinsSchema = z.object({
  studentId: idSchema,
  groupId: blankToNull(idSchema),
  reasonId: idSchema,
  amount: coins,
  comment: blankToNull(text(300)),
});
export type GiveCoinsInput = z.output<typeof giveCoinsSchema>;

export const productCategorySchema = z.object({ name: text(80) });
export type ProductCategoryInput = z.output<typeof productCategorySchema>;

export const productSchema = z.object({
  name: text(120),
  categoryId: idSchema,
  imageUrl: blankToNull(z.string().max(500)),
  priceCoins: coins,
  stock: z.coerce.number().int("validation.integer").min(0, "validation.min").max(1_000_000),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.output<typeof productSchema>;

export const purchaseRequestSchema = z.object({
  studentId: idSchema,
  productId: idSchema,
});
export type PurchaseRequestInput = z.output<typeof purchaseRequestSchema>;

export const purchaseDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});
export type PurchaseDecisionInput = z.output<typeof purchaseDecisionSchema>;

export const purchaseFilterSchema = z.object({
  status: z.enum(PURCHASE_STATUSES).optional(),
});

export const COIN_PERIODS = ["WEEK", "MONTH", "ALL"] as const;
export type CoinPeriod = (typeof COIN_PERIODS)[number];

/** Coins report filters (EXP §10 REYTING). */
export const coinRatingFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  branchId: idSchema.optional(),
  courseId: idSchema.optional(),
  groupId: idSchema.optional(),
  period: z.enum(COIN_PERIODS).default("ALL"),
});
export type CoinRatingFilters = z.output<typeof coinRatingFilterSchema>;
