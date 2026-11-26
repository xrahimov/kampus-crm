import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useStudentHome, useToday } from "@/api/hooks";
import { Loading, Screen } from "@/components/surface";
import { hasHome } from "@/features/office/site-paths";
import { useSession } from "@/lib/session";

import { isShortcut, staffTarget, studentTarget } from "./targets";

/*
 * The screen behind a shortcut (A-273): "Start my lesson" said to Siri, a
 * shortcut pressed on an Android home screen, a link `kampus://shortcut/…`.
 * It asks the server what is on now and passes the person on to that lesson,
 * to their homework, or home when there is nothing to open. It replaces
 * itself, so Back from the lesson does not return here.
 */
export function ShortcutScreen() {
  const { what } = useLocalSearchParams<{ what: string }>();
  const { state } = useSession();
  const staff = state.status === "staff";
  const today = useToday(null, staff);
  const home = useStudentHome(state.status === "student");
  // The moment the shortcut was used: "the lesson that is on" is judged against it.
  const [now] = useState(() => Date.now());

  const front: Href = staff ? (hasHome(state.me) ? "/staff/home" : "/staff") : "/student";
  if (!isShortcut(what)) return <Redirect href={front} />;

  if (staff) {
    if (today.data) return <Redirect href={staffTarget(what, today.data, now)} />;
    if (today.isError) return <Redirect href={front} />;
  } else {
    if (home.data) return <Redirect href={studentTarget(what, home.data)} />;
    if (home.isError) return <Redirect href={front} />;
  }
  return (
    <Screen scroll={false}>
      <View testID="shortcut-screen" style={styles.fill}>
        <Loading />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
