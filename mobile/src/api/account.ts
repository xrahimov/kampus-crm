import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/** The person's own account, as the site's "My account" page reads it (A-261). */
export interface Account {
  fullName: string;
  phone: string;
  signInCode: "OFF" | "TELEGRAM";
  /** A Telegram chat is linked: the sign-in code can go there. */
  telegramLinked: boolean;
  /** No password of their own yet: an administrator's, or none at all. */
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  /** This session was opened with a Telegram code: a new password needs no old one. */
  telegramSession: boolean;
  userId: string;
}

/** One place the person is signed in. */
export interface AccountSession {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** The session this app is using. */
  current: boolean;
}

export const accountKeys = {
  account: ["account"] as const,
  sessions: ["account", "sessions"] as const,
};

export function useAccount() {
  return useQuery({
    queryKey: accountKeys.account,
    queryFn: ({ signal }) => api<Account>("/auth/account", { signal }),
  });
}

/** Whether a Telegram code is asked for after the password. */
export function useSetSignInCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) =>
      api<Account>("/auth/account", {
        method: "PATCH",
        body: { signInCode: on ? "TELEGRAM" : "OFF" },
      }),
    onSuccess: (account) => client.setQueryData(accountKeys.account, account),
  });
}

export function useAccountSessions() {
  return useQuery({
    queryKey: accountKeys.sessions,
    queryFn: async ({ signal }) =>
      (await api<{ items: AccountSession[] }>("/auth/sessions", { signal })).items,
  });
}

/** Signs one other device out. */
export function useSignOutSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSettled: () => client.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

/** Signs every device out but this one; answers with how many there were. */
export function useSignOutOthers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ revoked: number }>("/auth/sessions", { method: "DELETE" }),
    onSettled: () => client.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}
