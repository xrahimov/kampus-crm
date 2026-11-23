import { Stack } from "expo-router";

import { useTheme } from "@/lib/theme";

/** The student's and parent's side: the home, and one screen per group. */
export default function StudentLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="class/[token]" />
    </Stack>
  );
}
