import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api, ApiError, setApiToken, setSessionLostHandler } from "./api";
import { secure } from "./storage";

/*
 * Who is signed in on this device (A-203). Kampus has two kinds of people with
 * separate accounts: staff (teachers, managers, directors) and students or
 * parents. The server tells the app which one a sign-in opened and hands it a
 * token; the token rests in the phone's keychain until the person signs out.
 */

export type SessionKind = "staff" | "student";

/** What `/auth/me` says about a signed-in staff member. */
export interface Me {
  user: {
    id: string;
    fullName: string;
    phone: string;
    photoUrl: string | null;
    mustChangePassword: boolean;
    hasSalary: boolean;
  };
  roles: Array<{ code: string; name: string }>;
  view: { current: "FULL" | "TEACHING"; canSwitch: boolean };
  permissions: string[];
  branches: Array<{ id: string; name: string }>;
  activeBranch: { id: string; name: string } | null;
}

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "staff"; me: Me }
  | { status: "student" };

interface SessionValue {
  state: SessionState;
  /** Keeps the token a sign-in answered with and opens that side of the app. */
  signIn: (kind: SessionKind, token: string) => Promise<void>;
  signOut: (options?: { everywhere?: boolean }) => Promise<void>;
  /** Reads `/auth/me` again (after the branch or the view changed). */
  refreshMe: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const KEY = "kampus.session";
const ME_KEY = "kampus.me";

interface Stored {
  kind: SessionKind;
  token: string;
}

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Stored>;
    if ((value.kind === "staff" || value.kind === "student") && typeof value.token === "string") {
      return { kind: value.kind, token: value.token };
    }
  } catch {
    // Unreadable: treated as signed out.
  }
  return null;
}

/** Whether the person may do something: a permission code, or the director's "*". */
export function can(me: Me | null | undefined, permission: string): boolean {
  if (!me) return false;
  return me.permissions.includes("*") || me.permissions.includes(permission);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const kindRef = useRef<SessionKind | null>(null);

  const forget = useCallback(async () => {
    kindRef.current = null;
    setApiToken(null);
    await Promise.all([secure.remove(KEY), secure.remove(ME_KEY)]);
    queryClient.clear();
    setState({ status: "signedOut" });
  }, [queryClient]);

  const loadMe = useCallback(async (): Promise<Me> => {
    const me = await api<Me>("/auth/me");
    await secure.set(ME_KEY, JSON.stringify(me));
    return me;
  }, []);

  // At launch: the kept token, if any, opens the side it belongs to.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = parseStored(await secure.get(KEY));
      if (cancelled) return;
      if (!stored) {
        setState({ status: "signedOut" });
        return;
      }
      kindRef.current = stored.kind;
      setApiToken(stored.token);
      if (stored.kind === "student") {
        setState({ status: "student" });
        return;
      }
      try {
        const me = await loadMe();
        if (!cancelled) setState({ status: "staff", me });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await forget();
          return;
        }
        // No network at launch: open with what was known last time.
        const cached = await secure.get(ME_KEY);
        if (cached) {
          try {
            setState({ status: "staff", me: JSON.parse(cached) as Me });
            return;
          } catch {
            // Fall through to signed out.
          }
        }
        setState({ status: "signedOut" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forget, loadMe]);

  // The server stopped knowing the token: back to the sign-in screen.
  useEffect(() => {
    setSessionLostHandler(() => {
      void forget();
    });
    return () => setSessionLostHandler(null);
  }, [forget]);

  const signIn = useCallback(
    async (kind: SessionKind, token: string) => {
      queryClient.clear();
      setApiToken(token);
      kindRef.current = kind;
      await secure.set(KEY, JSON.stringify({ kind, token } satisfies Stored));
      if (kind === "student") {
        setState({ status: "student" });
        return;
      }
      setState({ status: "staff", me: await loadMe() });
    },
    [loadMe, queryClient],
  );

  const signOut = useCallback(
    async (options?: { everywhere?: boolean }) => {
      const kind = kindRef.current;
      try {
        if (kind === "staff") await api("/auth/logout", { method: "POST" });
        else if (kind === "student") {
          await api("/student-auth/logout", {
            method: "POST",
            body: { everywhere: options?.everywhere === true },
          });
        }
      } catch {
        // Offline or already signed out there: this device forgets the token either way.
      }
      await forget();
    },
    [forget],
  );

  const refreshMe = useCallback(async () => {
    if (kindRef.current !== "staff") return;
    const me = await loadMe();
    setState({ status: "staff", me });
  }, [loadMe]);

  const value = useMemo(
    () => ({ state, signIn, signOut, refreshMe }),
    [state, signIn, signOut, refreshMe],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}

/** The signed-in staff member; only for screens behind the staff guard. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "staff") throw new Error("useMe outside the staff area");
  return state.me;
}
