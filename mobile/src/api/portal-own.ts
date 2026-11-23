import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ClassPage,
  LessonTime,
  PayProvider,
  PaymentStatus,
  PortalCertificate,
  PortalReferral,
  PortalSchedule,
  PortalTelegram,
} from "./types";

/*
 * What a student or parent arranges for themselves (A-216): lesson times,
 * the time zone, paying online, Telegram, the invite code and certificates.
 * Like the rest of the personal page, the membership token in the path is the
 * key and no session travels with it.
 */

const base = (token: string) => `/public/class/${encodeURIComponent(token)}`;

export const ownKeys = {
  page: (token: string) => ["student", "class-page", token] as const,
  schedule: (token: string) => ["student", "schedule", token] as const,
  telegram: (token: string) => ["student", "telegram", token] as const,
  referral: (token: string, locale: string) => ["student", "referral", token, locale] as const,
  certificates: (token: string) => ["student", "certificates", token] as const,
};

/** The group's weekly times, in the student's zone when they set one. */
export function useClassPage(token: string) {
  return useQuery({
    queryKey: ownKeys.page(token),
    queryFn: ({ signal }) => api<ClassPage>(base(token), { signal, anonymous: true }),
  });
}

/** The next lessons, what may be moved or cancelled, and the teacher's free times. */
export function usePortalSchedule(token: string) {
  return useQuery({
    queryKey: ownKeys.schedule(token),
    queryFn: ({ signal }) =>
      api<PortalSchedule>(`${base(token)}/schedule`, { signal, anonymous: true }),
  });
}

const change = (token: string, path: string, body?: LessonTime) =>
  api<PortalSchedule>(`${base(token)}/schedule/${path}`, {
    method: "POST",
    // Only the three fields the server reads, whatever else a slot carries.
    body: body && { date: body.date, startTime: body.startTime, endTime: body.endTime },
    anonymous: true,
  });

/** Each change answers with the schedule as it now stands. */
export const bookLesson = (token: string, at: LessonTime) => change(token, "book", at);
export const moveLesson = (token: string, lessonId: string, to: LessonTime) =>
  change(token, `${lessonId}/move`, to);
export const cancelLesson = (token: string, lessonId: string) =>
  change(token, `${lessonId}/cancel`);
export const rebookLesson = (token: string, dayOffId: string, at: LessonTime) =>
  change(token, `rebook/${dayOffId}`, at);

/** The zone the student lives in; null goes back to the centre's time. */
export function setTimeZone(token: string, timeZone: string | null): Promise<unknown> {
  return api<unknown>(`${base(token)}/time-zone`, {
    method: "POST",
    body: { timeZone },
    anonymous: true,
  });
}

/** Starts a payment; `url` is the provider's page where the card is entered. */
export function startPayment(
  token: string,
  payment: { provider: PayProvider; amount: number; effectiveMonth: string },
): Promise<{ id: string; url: string }> {
  return api<{ id: string; url: string }>(`${base(token)}/pay`, {
    method: "POST",
    body: payment,
    anonymous: true,
  });
}

/** Whether the provider has confirmed a payment yet. */
export function paymentStatus(token: string, id: string): Promise<PaymentStatus> {
  return api<PaymentStatus>(`${base(token)}/pay/${encodeURIComponent(id)}`, { anonymous: true });
}

/** The link that connects Telegram and the chats already connected. */
export function usePortalTelegram(token: string, watching: boolean) {
  return useQuery({
    queryKey: ownKeys.telegram(token),
    queryFn: ({ signal }) =>
      api<PortalTelegram>(`${base(token)}/telegram`, { signal, anonymous: true }),
    // After the student went to Telegram, look for the new chat for a while.
    refetchInterval: watching ? 4_000 : false,
  });
}

export function unlinkTelegramChat(token: string, chatId: string): Promise<unknown> {
  return api<unknown>(`${base(token)}/telegram/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
    anonymous: true,
  });
}

/** The invite code, the link that carries it and how many friends joined. */
export function usePortalReferral(token: string, locale: string) {
  return useQuery({
    queryKey: ownKeys.referral(token, locale),
    queryFn: ({ signal }) =>
      api<PortalReferral>(`${base(token)}/referral?locale=${locale}`, { signal, anonymous: true }),
  });
}

/** The student's certificates, each with its public page. */
export function usePortalCertificates(token: string) {
  return useQuery({
    queryKey: ownKeys.certificates(token),
    queryFn: ({ signal }) =>
      api<PortalCertificate[]>(`${base(token)}/certificates`, { signal, anonymous: true }),
  });
}
