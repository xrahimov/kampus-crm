import { Stack } from "expo-router";

import { useTheme } from "@/lib/theme";

/** The student's and parent's side: the home, one screen per group, and that group's pages. */
export default function StudentLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="class/[token]" />
      <Stack.Screen name="homework/[token]" />
      <Stack.Screen name="materials/[token]" />
      <Stack.Screen name="tests/[token]" />
      <Stack.Screen name="exercise/[token]" />
      <Stack.Screen name="chat/[token]" />
      <Stack.Screen name="course/[token]" />
      <Stack.Screen name="stream/[token]" />
      <Stack.Screen name="news/[token]" />
      <Stack.Screen name="results/[token]" />
      <Stack.Screen name="schedule/[token]" />
      <Stack.Screen name="pay/[token]" />
      <Stack.Screen name="telegram/[token]" />
      <Stack.Screen name="invite/[token]" />
      {/* A lesson is left with its own button, not by a stray swipe from the edge. */}
      <Stack.Screen name="room/[token]" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}
