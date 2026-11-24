import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { scanBadge, type ScanResult, type ScanStatus } from "@/api/scan";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { buzz } from "@/components/motion";
import { Badge, Card, Divider, Notice, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { BadgeCamera } from "./badge-camera";

/** The camera sees a badge many times a second; the same one is sent again only after this long. */
const REPEAT_MS = 4000;
/** The list keeps this many of the latest badges. */
const LINES_MOST = 50;

interface Line {
  key: number;
  at: string;
  code: string;
  result: ScanResult | null;
  problem: string | null;
}

const STATUS_TONE: Record<ScanStatus, Tone> = {
  marked: "success",
  already: "neutral",
  noLesson: "warning",
  unknown: "destructive",
};

/**
 * Attendance by badge (A-139, in the app A-264). The camera, a hand scanner
 * or the keyboard gives a student's badge code and the student is marked
 * present: on the lesson this screen was opened for, else on their lesson of
 * the day. Every badge gets a line saying what the server made of it, and the
 * phone buzzes so that the person at the door need not look.
 */
export function ScanScreen() {
  const params = useLocalSearchParams<{ lesson?: string; group?: string; time?: string }>();
  const lessonId = params.lesson ? params.lesson : null;
  const t = useTranslations();
  const ts = useTranslations("today.scan");
  const { wide } = useLayout();
  const me = useMe();
  const client = useQueryClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [typed, setTyped] = useState("");
  const latest = useRef("");
  const recent = useRef(new Map<string, number>());
  const counter = useRef(0);
  const changed = useRef(false);

  // The day and the group's month show who is present: read again after leaving, if anybody was marked.
  useEffect(
    () => () => {
      if (!changed.current) return;
      void client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "today" ||
          (query.queryKey[0] === "group" && query.queryKey[2] === "month"),
      });
    },
    [client],
  );

  /** A badge the camera keeps seeing is sent once in a while; a typed code always goes. */
  const send = async (code: string, fromCamera: boolean) => {
    const now = Date.now();
    const last = recent.current.get(code);
    if (fromCamera && last !== undefined && now - last < REPEAT_MS) return;
    recent.current.set(code, now);
    const key = (counter.current += 1);
    const at = clock(new Date(now));
    const add = (line: Line) => setLines((list) => [line, ...list].slice(0, LINES_MOST));
    try {
      const result = await scanBadge(code, lessonId);
      if (result.status === "marked") changed.current = true;
      add({ key, at, code, result, problem: null });
      buzz(result.status === "marked" || result.status === "already");
    } catch (error) {
      add({ key, at, code, result: null, problem: errorText(t, error) });
      buzz(false);
    }
  };

  /**
   * A hand scanner types the code and presses Enter in one go, and on a phone
   * the Enter arrives before the last letter has reached `typed`: the text is
   * taken from the Enter itself, else from the latest change.
   */
  const submit = (text?: string) => {
    const code = (text ?? latest.current).trim();
    if (!code) return;
    latest.current = "";
    setTyped("");
    void send(code, false);
  };
  const change = (text: string) => {
    latest.current = text;
    setTyped(text);
  };

  const header = <Header back title={ts("title")} />;
  if (!can(me, "groups.attendance.mark")) {
    return (
      <Screen header={header}>
        <Notice tone="destructive" testID="scan-forbidden">
          {t("errors.forbidden")}
        </Notice>
      </Screen>
    );
  }

  const marked = lines.filter((line) => line.result?.status === "marked").length;
  const newest = lines[0] ?? null;
  const camera = <BadgeCamera onCode={(code) => void send(code, true)} />;
  const rest = (
    <>
      <Card>
        <Text variant="heading">{ts("manual")}</Text>
        {/* On a phone the list is under the keyboard, and so is all below the field: the latest
            badge is said above it too. */}
        {!wide && newest ? (
          <View style={styles.last} testID="scan-last">
            <Text variant="small" numberOfLines={1} style={styles.fill}>
              {newest.result?.studentName ?? newest.problem ?? newest.code}
            </Text>
            <Badge
              tone={newest.result ? STATUS_TONE[newest.result.status] : "destructive"}
              label={ts(`status.${newest.result ? newest.result.status : "error"}`)}
            />
          </View>
        ) : null}
        <Field
          label={ts("code")}
          value={typed}
          onChangeText={change}
          onSubmitEditing={(event) => submit(event?.nativeEvent?.text)}
          submitBehavior="submit"
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="kampus:student:…"
          hint={ts("manualHint")}
          maxLength={200}
          testID="scan-code"
        />
        <Button
          variant="outline"
          label={t("mobile.scan.send")}
          disabled={!typed.trim()}
          onPress={() => submit()}
          testID="scan-send"
          style={styles.start}
        />
      </Card>
      <Card style={styles.flush} testID="scan-log">
        <View style={styles.logHead}>
          <Text variant="heading" style={styles.fill}>
            {ts("log")}
          </Text>
          <Text variant="small" tone="mutedForeground" testID="scan-count">
            {ts("markedCount", { count: marked })}
          </Text>
        </View>
        {lines.length === 0 ? (
          <Text tone="mutedForeground" style={styles.empty} testID="scan-empty">
            {ts("empty")}
          </Text>
        ) : (
          lines.map((line) => (
            <View key={line.key}>
              <Divider />
              <View style={styles.line} testID={`scan-line-${line.key}`}>
                <Text variant="small" tone="mutedForeground" style={styles.at}>
                  {line.at}
                </Text>
                <View style={styles.fill}>
                  {line.result?.studentName ? (
                    <>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {line.result.studentName}
                      </Text>
                      {line.result.groupName ? (
                        <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                          {[line.result.groupName, line.result.lessonTime]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text tone="mutedForeground" numberOfLines={2}>
                      {line.code}
                    </Text>
                  )}
                  {line.problem ? (
                    <Text variant="small" tone="destructive">
                      {line.problem}
                    </Text>
                  ) : null}
                </View>
                {line.result ? (
                  <Badge
                    tone={STATUS_TONE[line.result.status]}
                    label={ts(`status.${line.result.status}`)}
                    testID={`scan-status-${line.key}`}
                  />
                ) : (
                  <Badge
                    tone="destructive"
                    label={ts("status.error")}
                    testID={`scan-status-${line.key}`}
                  />
                )}
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );

  return (
    <Screen header={header} contentStyle={styles.column}>
      <Text tone="mutedForeground" testID="scan-target">
        {lessonId && params.group
          ? ts("forLesson", { group: params.group, time: params.time ?? "" })
          : ts("anyLesson")}
      </Text>
      {wide ? (
        <View style={styles.split}>
          <View style={styles.side}>{camera}</View>
          <View style={styles.main}>{rest}</View>
        </View>
      ) : (
        <>
          {camera}
          {rest}
        </>
      )}
    </Screen>
  );
}

/** The hour and minute on this device, as the site's list shows them. */
function clock(now: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(now.getHours())}:${two(now.getMinutes())}`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  side: { flex: 2 },
  main: { flex: 3, gap: space[4] },
  start: { alignSelf: "flex-start" },
  last: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  logHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  empty: { paddingHorizontal: space[4], paddingBottom: space[4] },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
  },
  at: { fontVariant: ["tabular-nums"] },
});
