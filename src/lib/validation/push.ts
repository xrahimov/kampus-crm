import { z } from "zod";

/** What `PushManager.subscribe()` hands the page, plus where and in which language it was asked (A-176). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  locale: z.enum(["uz", "ru", "en"]).default("uz"),
  path: z
    .string()
    .regex(/^\/(uz|ru|en)\/(class|student|family)\/[A-Za-z0-9_-]{1,80}$/)
    .max(120),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushEndpointSchema = z.object({ endpoint: z.string().url().max(2000) });
