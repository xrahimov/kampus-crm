import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

/* What the tests of the student's pages share: a made-up server answer and the app around a screen. */

/** A server answer as `fetch` gives it. */
export function answer(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

const clients: QueryClient[] = [];

/** Draws a screen inside the app's providers on a phone-sized frame. */
export async function renderScreen(screen: ReactElement): Promise<QueryClient> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <I18nProvider>{screen}</I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return client;
}

/** Empties every cache a test made, so nothing keeps the test runner awake. */
export function clearClients(): void {
  for (const client of clients.splice(0)) client.clear();
}

/** The JSON body of a request the app made. */
export function sentBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : null;
}
