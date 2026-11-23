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
      {/* A lesson is left with its own button, not by a stray swipe from the edge. */}
      <Stack.Screen name="room/[token]" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
