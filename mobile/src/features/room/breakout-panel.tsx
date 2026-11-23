import { Megaphone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { radius, space } from "@/lib/theme";
import { BREAKOUT_MAX_ROOMS, NOTICE_MAX_LENGTH } from "@kampus/lib/validation/video";
import type { CallEngine } from "@kampus/lib/video/call-engine";
import { breakoutCountdown } from "@kampus/lib/video/room-view";

import { room } from "./look";
import { Chip, PanelButton, PanelInput } from "./panel-parts";

const ROOM_CHOICES = [2, 3, 4, 5, 6].filter((n) => n <= BREAKOUT_MAX_ROOMS);
const MINUTE_CHOICES = [5, 10, 15, 20, 30] as const;

/**
 * The teacher's breakout rooms, in the app (A-156, A-211): split the students
 * into small rooms for a while, move someone, drop in on a room, send a line
 * to every room and bring everyone back. The same rooms as on the site.
 */
export function BreakoutPanel({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.breakout");
  const tr = useTranslations("video.roles");
  const [rooms, setRooms] = useState(2);
  const [minutes, setMinutes] = useState<number | null>(10);
  const [notice, setNotice] = useState("");
  const breakout = engine.breakout;
  const everyone = breakout.everyone ?? [];
  const students = everyone.filter((p) => p.role === "STUDENT");
  const open = breakout.rooms > 0;

  const start = () => {
    // Students go round the rooms in turn; guests stay in the main room with the teacher.
    const assign = students.map((p, i) => ({ id: p.id, room: (i % rooms) + 1 }));
    engine.startBreakout(rooms, minutes, assign);
  };
  const send = () => {
    if (!notice.trim()) return;
    engine.sendNotice(notice);
    setNotice("");
  };

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      testID="breakout-panel"
    >
      {!open ? (
        <>
          <Text variant="small" style={styles.muted}>
            {t("intro")}
          </Text>
          <View style={styles.field}>
            <Text variant="smallStrong" style={styles.ink}>
              {t("rooms")}
            </Text>
            <View style={styles.chips}>
              {ROOM_CHOICES.map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  chosen={rooms === n}
                  onPress={() => setRooms(n)}
                  accessibilityLabel={`${t("rooms")}: ${n}`}
                  testID={`breakout-rooms-${n}`}
                />
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text variant="smallStrong" style={styles.ink}>
              {t("minutes")}
            </Text>
            <View style={styles.chips}>
              {MINUTE_CHOICES.map((n) => (
                <Chip
                  key={n}
                  label={t("min", { count: n })}
                  chosen={minutes === n}
                  onPress={() => setMinutes(n)}
                  testID={`breakout-minutes-${n}`}
                />
              ))}
              <Chip
                label={t("untilClosed")}
                chosen={minutes === null}
                onPress={() => setMinutes(null)}
                testID="breakout-minutes-none"
              />
            </View>
          </View>
          <PanelButton
            label={t("start", { rooms })}
            tone="main"
            disabled={students.length === 0}
            onPress={start}
            testID="breakout-start"
          />
          {students.length === 0 ? (
            <Text variant="small" style={styles.muted} testID="breakout-no-students">
              {t("noStudents")}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <TimeLeft endsAt={breakout.endsAt} />
          <RoomList engine={engine} />
          <View style={styles.noticeRow}>
            <PanelInput
              value={notice}
              onChangeText={setNotice}
              maxLength={NOTICE_MAX_LENGTH}
              placeholder={t("noticePlaceholder")}
              accessibilityLabel={t("notice")}
              onSubmitEditing={send}
              returnKeyType="send"
              style={styles.fill}
              testID="breakout-notice"
            />
            <Pressable
              onPress={send}
              disabled={!notice.trim()}
              accessibilityRole="button"
              accessibilityLabel={t("sendNotice")}
              style={({ pressed }) => [
                styles.noticeSend,
                pressed && styles.pressed,
                !notice.trim() && styles.disabled,
              ]}
              testID="breakout-notice-send"
            >
              <Megaphone size={18} color={room.activeInk} />
            </Pressable>
          </View>
          <PanelButton
            label={t("end")}
            onPress={() => engine.endBreakout()}
            testID="breakout-end"
          />
        </>
      )}
      <Text variant="small" style={styles.muted}>
        {t("hint", { role: tr("STAFF") })}
      </Text>
    </ScrollView>
  );
}

/** The time until the rooms close, counted down by the second. */
function TimeLeft({ endsAt }: { endsAt: string | null }) {
  const now = useNow(endsAt !== null);
  const left = breakoutCountdown(endsAt, now);
  if (!left) return null;
  return (
    <Text variant="heading" style={styles.ink} testID="breakout-time">
      {left}
    </Text>
  );
}

/** The clock, ticking each second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Every room with who is in it; a person's row opens the rooms they can be moved to. */
function RoomList({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.breakout");
  const breakout = engine.breakout;
  const everyone = breakout.everyone ?? [];
  const self = engine.self.participantId;
  const numbers: Array<number | null> = [
    null,
    ...Array.from({ length: breakout.rooms }, (_, i) => i + 1),
  ];
  const name = (n: number | null) => (n === null ? t("mainRoom") : t("room", { number: n }));
  const [moving, setMoving] = useState<string | null>(null);

  return (
    <View style={styles.list} testID="breakout-list">
      {numbers.map((number) => {
        // The list may or may not name the teacher; they are counted where they are.
        const members = everyone.filter((p) => p.room === number && p.id !== self);
        const here = breakout.mine === number;
        const key = number ?? 0;
        return (
          <View
            key={key}
            style={[styles.room, here && styles.roomHere]}
            testID={`breakout-room-${key}`}
          >
            <View style={styles.roomHead}>
              <Text variant="bodyStrong" style={[styles.ink, styles.fill]}>
                {name(number)}{" "}
                <Text variant="small" style={styles.muted}>
                  {members.length + (here ? 1 : 0)}
                </Text>
              </Text>
              {here ? (
                <Text variant="small" style={styles.active}>
                  {t("youAreHere")}
                </Text>
              ) : (
                <Chip
                  label={t("visit")}
                  onPress={() => engine.moveToRoom(self, number)}
                  accessibilityLabel={`${t("visit")}: ${name(number)}`}
                  testID={`breakout-visit-${key}`}
                />
              )}
            </View>
            {members.map((member) => (
              <View key={member.id}>
                <Pressable
                  onPress={() => setMoving((cur) => (cur === member.id ? null : member.id))}
                  accessibilityRole="button"
                  accessibilityLabel={t("moveTo", { name: member.displayName })}
                  accessibilityState={{ expanded: moving === member.id }}
                  style={({ pressed }) => [styles.member, pressed && styles.pressed]}
                  testID={`breakout-member-${member.id}`}
                >
                  <Text variant="small" style={styles.ink} numberOfLines={1}>
                    {member.displayName}
                  </Text>
                </Pressable>
                {moving === member.id ? (
                  <View style={styles.chips} testID={`breakout-move-${member.id}`}>
                    {numbers
                      .filter((n) => n !== number)
                      .map((n) => (
                        <Chip
                          key={n ?? 0}
                          label={name(n)}
                          onPress={() => {
                            engine.moveToRoom(member.id, n);
                            setMoving(null);
                          }}
                          testID={`breakout-move-${member.id}-${n ?? 0}`}
                        />
                      ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ink: { color: room.ink },
  muted: { color: room.inkMuted },
  active: { color: room.active },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  body: { padding: space[4], gap: space[3] },
  field: { gap: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  list: { gap: space[2] },
  room: {
    padding: space[3],
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: room.border,
  },
  roomHere: { borderColor: room.active },
  roomHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  member: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
    marginBottom: space[1],
  },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  noticeSend: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: room.active,
  },
});
