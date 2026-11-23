import "@/lib/intl-polyfills";

import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  useFonts,
} from "@expo-google-fonts/onest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/lib/theme";

// The start-up picture stays until the fonts and the kept sign-in are known,
// so the first thing drawn is the right screen in the right typeface.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // A refusal (signed out, not allowed, not found) will not change by asking again.
            retry: (count, error) =>
              !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>
            <SessionProvider>
              <Navigation fontsReady={fontsLoaded || Boolean(fontError)} />
            </SessionProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigation({ fontsReady }: { fontsReady: boolean }) {
  const { state } = useSession();
  const { colors, dark } = useTheme();
  const ready = fontsReady && state.status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          // Signing in or out changes the whole app: one side fades into the other (A-224).
          animation: "fade",
        }}
      >
        {/* Each side of the app is open only to the people it is for (A-203). */}
        <Stack.Protected guard={state.status === "signedOut"}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === "staff"}>
          <Stack.Screen name="staff" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === "student"}>
          <Stack.Screen name="student" />
        </Stack.Protected>
        <Stack.Protected guard={state.status === "staff" || state.status === "student"}>
          <Stack.Screen
            name="set-password"
            options={{ presentation: "modal", animation: "default" }}
          />
          {/* A file opened inside the app: homework, materials (A-212). */}
          <Stack.Screen name="file" options={{ animation: "ios_from_right" }} />
        </Stack.Protected>
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}
