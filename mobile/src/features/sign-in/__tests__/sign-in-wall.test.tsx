import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SignInScreen } from "@/features/sign-in/sign-in-screen";
import { answer } from "@/features/student/test-support";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/lib/session", () => ({
  useSession: () => ({ state: { status: "signedOut" }, signIn: jest.fn() }),
}));
let mockWide = true;
jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ wide: mockWide, width: mockWide ? 1180 : 390 }),
}));

/*
 * The sign-in page on a tablet (A-271): the dark tile wall starts under the
 * status bar. A tablet's clock and date sit over that corner in the page's
 * ink, and on the wall they could not be read in light mode.
 */

const STATUS_BAR = 32;
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
});
const realFetch = globalThis.fetch;

beforeEach(() => {
  mockWide = true;
  globalThis.fetch = jest.fn(async () =>
    answer(404, { error: { code: "errors.notFound" } }),
  ) as unknown as typeof fetch;
});
afterEach(() => {
  client.clear();
  globalThis.fetch = realFetch;
});

async function show() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 1180, height: 820 },
        insets: { top: STATUS_BAR, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <I18nProvider>
            <SignInScreen />
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe("the sign-in page's tile wall", () => {
  it("starts under the status bar on a tablet", async () => {
    await show();
    const side = await screen.findByTestId("sign-in-wall-side");
    expect(StyleSheet.flatten(side.props.style)).toMatchObject({ paddingTop: STATUS_BAR });
  });

  it("is not drawn on a phone", async () => {
    mockWide = false;
    await show();
    await screen.findByText("Kampus");
    expect(screen.queryByTestId("sign-in-wall-side")).toBeNull();
  });
});
