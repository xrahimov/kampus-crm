import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/*
 * The centre's connections to other services (A-249): the site's Settings →
 * Integrations, AmoCRM and FaceID. The calls those three pages make.
 */

/** The site's `INTEGRATION_PROVIDERS` (src/lib/validation/integrations.ts). */
export type IntegrationProvider =
  | "SMS"
  | "TELEGRAM"
  | "AMOCRM"
  | "TELEPHONY"
  | "FACE_ID"
  | "VIDEO"
  | "PAYME"
  | "CLICK"
  | "FISCAL"
  | "INSTAGRAM"
  | "AI";

export interface Integration {
  provider: IntegrationProvider;
  isEnabled: boolean;
  /** What is set. A secret comes back as `MASKED` when it is set, "" when it is not. */
  config: Record<string, unknown>;
  /** What the server adds to read: whether amoCRM holds tokens, the shared bot. */
  state: Record<string, unknown>;
  updatedAt: string | null;
}

/**
 * What the server sends in place of a secret that is set. Sent back as it is,
 * it means "keep what you have" (the site's `MASKED`).
 */
export const MASKED = "••••••••";

/** "FACE_ID" is "/integrations/face-id". */
export function providerPath(provider: IntegrationProvider): string {
  return provider.toLowerCase().replace("_", "-");
}

export const integrationKeys = {
  all: ["integrations"] as const,
  one: (provider: IntegrationProvider) => ["integrations", provider] as const,
};

export function useIntegrations() {
  return useQuery({
    queryKey: integrationKeys.all,
    queryFn: ({ signal }) => api<Integration[]>("/integrations", { signal }),
  });
}

export function useIntegration(provider: IntegrationProvider) {
  return useQuery({
    queryKey: integrationKeys.one(provider),
    queryFn: ({ signal }) =>
      api<Integration>(`/integrations/${providerPath(provider)}`, { signal }),
  });
}

/** Saves one service's switch and fields; the answer is the service as it is now. */
export function useSaveIntegration(provider: IntegrationProvider) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Integration>(`/integrations/${providerPath(provider)}`, { method: "PUT", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: integrationKeys.all }),
  });
}

export interface QueueRun {
  claimed: number;
  done: number;
  failed: number;
  pending: number;
}

/** One pass over the waiting SMS and bot messages, for a server without its worker. */
export function useRunQueue() {
  return useMutation({
    mutationFn: () => api<QueueRun>("/jobs/run", { method: "POST" }),
  });
}

export interface AmoCrmTest {
  ok: boolean;
  account?: string;
  /** A message key, such as "errors.integration". */
  error?: string;
  /** "fake" while no credentials are entered. */
  adapter: string;
}

export function useAmoCrmTest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<AmoCrmTest>("/integrations/amocrm-test", { method: "POST" }),
    // A first successful test stores the tokens: "connected" follows.
    onSuccess: () => client.invalidateQueries({ queryKey: integrationKeys.one("AMOCRM") }),
  });
}
