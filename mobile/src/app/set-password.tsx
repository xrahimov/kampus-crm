import { useLocalSearchParams } from "expo-router";

import { PasswordScreen } from "@/features/shared/password-screen";

/** Offered once after a sign-in with a Telegram code; `current=1` when opened from the settings. */
export default function SetPassword() {
  const { current } = useLocalSearchParams<{ current?: string }>();
  return <PasswordScreen askCurrent={current === "1"} />;
}
