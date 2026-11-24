import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Page } from "./types";

/*
 * Telegram recipients and lead forms for the office (A-247): the site's
 * Settings → Bot notifications and Settings → Forms. The calls those two
 * pages make.
 */

export interface BotRecipient {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  /** The person's Telegram chat, as the bot's /id told them. */
  chatId: string;
  /** Empty is every branch. */
  branchNames: string[];
}

export interface BotRecipientInput {
  userId: string;
  chatId: string;
  branchIds: string[];
}

export interface StaffChoice {
  id: string;
  fullName: string;
  phone: string;
}

export interface LeadForm {
  id: string;
  name: string;
  /** The last part of the form's public address: /forms/<slug>. */
  slug: string;
  columnId: string;
  columnName: string;
  boardName: string;
  sourceId: string | null;
  sourceName: string | null;
  /** The centre's own note: the site the form is on. */
  integration: string | null;
  isActive: boolean;
  leadCount: number;
}

export interface LeadFormInput {
  name: string;
  slug: string;
  columnId: string;
  sourceId: string | null;
  integration: string | null;
  isActive: boolean;
}

export const formsBotKeys = {
  recipients: ["bot-recipients"] as const,
  staff: ["bot-recipients", "staff"] as const,
  forms: ["lead-forms"] as const,
};

export function useBotRecipients() {
  return useQuery({
    queryKey: formsBotKeys.recipients,
    queryFn: ({ signal }) => api<BotRecipient[]>("/bot-recipients", { signal }),
  });
}

/** The staff to choose a recipient from, by name. Needs the right to see the staff. */
export function useStaffChoices(enabled: boolean) {
  return useQuery({
    queryKey: formsBotKeys.staff,
    queryFn: async ({ signal }) =>
      (await api<Page<StaffChoice>>("/staff?sort=fullName:asc&pageSize=100", { signal })).items,
    enabled,
  });
}

export function useAddBotRecipient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BotRecipientInput) =>
      api<BotRecipient>("/bot-recipients", { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: formsBotKeys.recipients }),
  });
}

export function useRemoveBotRecipient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<unknown>(`/bot-recipients/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: formsBotKeys.recipients }),
  });
}

export function useLeadForms() {
  return useQuery({
    queryKey: formsBotKeys.forms,
    queryFn: ({ signal }) => api<LeadForm[]>("/lead-forms", { signal }),
  });
}

/** A form added, changed, or with `input: null` deleted. General settings names the forms too. */
export function useLeadFormStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: LeadFormInput | null }) => {
      if (id && input === null) return api<unknown>(`/lead-forms/${id}`, { method: "DELETE" });
      return id
        ? api<LeadForm>(`/lead-forms/${id}`, { method: "PATCH", body: input })
        : api<LeadForm>("/lead-forms", { method: "POST", body: input });
    },
    onSuccess: () => client.invalidateQueries(),
  });
}
