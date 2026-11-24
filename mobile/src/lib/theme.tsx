import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

/*
 * The Kampus look in the app: the same tokens as the site's globals.css
 * ("Samarkand" palette), written out as plain colours because React Native has
 * no CSS variables. Lapis for the navigation, dome turquoise for what is
 * active, porcelain for the page, saffron for the payment button only.
 */

export const palette = {
  light: {
    background: "#f7f9fc",
    foreground: "#171f30",
    card: "#ffffff",
    primary: "#2d4498",
    primaryForeground: "#f8fafd",
    secondary: "#edf0f6",
    secondaryForeground: "#242d42",
    muted: "#f0f3f7",
    mutedForeground: "#5c6472",
    accent: "#cdf4f3",
    accentForeground: "#004043",
    destructive: "#cc272e",
    destructiveSoft: "#fbe9ea",
    success: "#319751",
    successSoft: "#e3f3e8",
    warning: "#e49e22",
    warningSoft: "#fcf1dc",
    saffron: "#f2b036",
    saffronForeground: "#3b1e02",
    border: "#dbe0e8",
    input: "#d2d8e1",
    ring: "#009a9b",
    sidebar: "#17234b",
    sidebarForeground: "#becbe2",
    sidebarMuted: "#27355f",
    sidebarActive: "#58d4d0",
    // The series of a chart (A-230, a third with A-238): lapis, turquoise and ochre, checked
    // for colour-blind readers against the card in both looks.
    series1: "#3d5fc4",
    series2: "#0f9a9b",
    series3: "#c9820a",
    scrim: "rgba(10, 19, 49, 0.45)",
  },
  dark: {
    background: "#0c111f",
    foreground: "#eceff2",
    card: "#141a2b",
    primary: "#83a3ea",
    primaryForeground: "#0c111f",
    secondary: "#1f2638",
    secondaryForeground: "#eceff2",
    muted: "#1b2130",
    mutedForeground: "#9ca5b5",
    accent: "#003c3f",
    accentForeground: "#d5f2f1",
    destructive: "#f14d4c",
    destructiveSoft: "#3a1719",
    success: "#54b66e",
    successSoft: "#12301d",
    warning: "#f5ae39",
    warningSoft: "#3a2a0c",
    saffron: "#f2b036",
    saffronForeground: "#3b1e02",
    border: "#2b3245",
    input: "#30374a",
    ring: "#43c3c3",
    sidebar: "#060a1a",
    sidebarForeground: "#becbe2",
    sidebarMuted: "#111932",
    sidebarActive: "#58d4d0",
    series1: "#5f7fe0",
    series2: "#27a5a2",
    series3: "#c0841f",
    scrim: "rgba(1, 3, 12, 0.6)",
  },
} as const;

export type Colors = { [K in keyof (typeof palette)["light"]]: string };

/** Spacing steps in points, the site's 4-point scale. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const radius = { sm: 4, md: 10, lg: 12, xl: 16, full: 999 } as const;

/** Onest, the site's one typeface (it covers Cyrillic), loaded in the root layout. */
export const font = {
  regular: "Onest_400Regular",
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold",
} as const;

/** A screen at least this wide is laid out as a tablet: a side rail and two columns. */
export const TABLET_MIN_WIDTH = 768;
/** Text columns stop growing here; a wider tablet gets margins, not longer lines. */
export const CONTENT_MAX_WIDTH = 1040;

export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

interface ThemeValue {
  colors: Colors;
  dark: boolean;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue>({
  colors: palette.light,
  dark: false,
  choice: "system",
  setChoice: () => undefined,
});

const STORAGE_KEY = "kampus.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const device = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark") setChoiceState(stored);
      })
      .catch(() => undefined);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const dark = choice === "system" ? device === "dark" : choice === "dark";
    return { colors: dark ? palette.dark : palette.light, dark, choice, setChoice };
  }, [choice, device, setChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
