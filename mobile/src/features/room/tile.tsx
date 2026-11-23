import { Hand, MicOff, MonitorUp, Star } from "lucide-react-native";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { font, radius, space } from "@/lib/theme";

import { room } from "./look";
import { StreamView } from "./platform";

export interface TileProps {
  stream: MediaStream;
  name: string;
  isSelf?: boolean;
  audioOn: boolean;
  /** The camera is on, or a screen is shared in its place. */
  videoOn: boolean;
  /** The picture is a shared screen: shown whole, never mirrored. */
  screen?: boolean;
  hand?: boolean;
  /** Place in the queue of raised hands, from 1. */
  handPlace?: number;
  reaction?: { key: number; emoji: string };
  /** The teacher shows this person to everyone. */
  spotlight?: boolean;
  /** "Connecting…" or why the connection failed; null once connected. */
  status?: string | null;
  /** The big tile on the stage: the whole picture, larger labels. */
  big?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One person in the room: their picture, or their initials while the camera is off. */
export function Tile({
  stream,
  name,
  isSelf = false,
  audioOn,
  videoOn,
  screen = false,
  hand = false,
  handPlace,
  reaction,
  spotlight = false,
  status,
  big = false,
  onPress,
  style,
  testID,
}: TileProps) {
  const t = useTranslations("video.room");
  const hasPicture = videoOn && stream.getVideoTracks().length > 0;
  const label = isSelf ? t("you", { name }) : name;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[
        label,
        audioOn ? null : t("muted"),
        hand ? (handPlace ? t("handPlace", { place: handPlace }) : t("handRaised")) : null,
        screen ? t("sharing") : null,
      ]
        .filter(Boolean)
        .join(", ")}
      testID={testID}
      style={[styles.tile, spotlight && styles.spotlight, style]}
    >
      {hasPicture ? (
        <StreamView
          stream={stream}
          mirror={isSelf && !screen}
          fit={screen || big ? "contain" : "cover"}
          style={styles.fill}
        />
      ) : (
        <View style={styles.center}>
          <View style={[styles.initials, big && styles.initialsBig]}>
            <Text style={[styles.initialsText, big && styles.initialsTextBig]}>
              {initials(name)}
            </Text>
          </View>
        </View>
      )}

      {status ? (
        <View style={styles.status}>
          <Text variant="small" style={styles.statusText} numberOfLines={3}>
            {status}
          </Text>
        </View>
      ) : null}

      {reaction ? (
        <View style={styles.reaction} key={reaction.key}>
          <Text style={big ? styles.reactionBig : styles.reactionText}>{reaction.emoji}</Text>
        </View>
      ) : null}

      <View style={styles.top}>
        {spotlight ? (
          <View style={styles.chip}>
            <Star size={12} color={room.active} />
          </View>
        ) : null}
        {hand ? (
          <View style={[styles.chip, styles.handChip]}>
            <Hand size={12} color={room.activeInk} />
            {handPlace ? <Text style={styles.handText}>{handPlace}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.bottom}>
        {!audioOn ? <MicOff size={14} color={room.danger} /> : null}
        {screen ? <MonitorUp size={14} color={room.active} /> : null}
        <Text variant={big ? "bodyStrong" : "smallStrong"} style={styles.name} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** "Malika Yusupova" → "MY"; one word gives one letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

const styles = StyleSheet.create({
  tile: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: room.surface,
    borderWidth: 1,
    borderColor: room.border,
  },
  spotlight: { borderColor: room.active, borderWidth: 2 },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  initials: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: room.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsBig: { width: 112, height: 112 },
  initialsText: { fontFamily: font.semibold, fontSize: 20, color: room.ink },
  initialsTextBig: { fontSize: 40, lineHeight: 48 },
  status: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: space[3],
    backgroundColor: room.scrim,
  },
  statusText: { color: room.ink, textAlign: "center" },
  reaction: { position: "absolute", right: space[2], top: space[2] },
  reactionText: { fontSize: 28, lineHeight: 34 },
  reactionBig: { fontSize: 56, lineHeight: 64 },
  top: { position: "absolute", left: space[2], top: space[2], flexDirection: "row", gap: space[1] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: room.scrim,
  },
  handChip: { backgroundColor: room.active },
  handText: { fontFamily: font.semibold, fontSize: 12, color: room.activeInk },
  bottom: {
    position: "absolute",
    left: space[2],
    bottom: space[2],
    maxWidth: "92%",
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingHorizontal: space[2],
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: room.scrim,
  },
  name: { color: room.ink, flexShrink: 1 },
});
