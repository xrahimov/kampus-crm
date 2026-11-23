import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { clock, type FileSource } from "@/features/room/file-source";
import { useLocalFile } from "@/features/files/local-file";
import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * A short recording played in place (A-212): a spoken answer, the teacher's
 * voice reply. One button, the time, and a bar that fills.
 */
export function AudioClip(props: { source: FileSource; label: string; testID?: string }) {
  const t = useTranslations("mobile.file");
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  // A browser cannot send the session with a recording's address; it is fetched first.
  const file = useLocalFile(props.source, () => setFailed(true));
  if (!file) {
    return (
      <View style={[styles.clip, { backgroundColor: colors.muted }]} testID={props.testID}>
        {failed ? (
          <Text variant="small" tone="destructive">
            {t("failed")}
          </Text>
        ) : (
          <ActivityIndicator color={colors.mutedForeground} />
        )}
      </View>
    );
  }
  return <Clip {...props} source={file} />;
}

function Clip({ source, label, testID }: { source: FileSource; label: string; testID?: string }) {
  const t = useTranslations("mobile.homework");
  const { colors } = useTheme();
  const player = useAudioPlayer(
    source.headers ? { uri: source.uri, headers: source.headers } : { uri: source.uri },
  );
  const status = useAudioPlayerStatus(player);
  const duration = status.duration > 0 ? status.duration : 0;
  const done = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Played to the end: start over.
    if (duration > 0 && status.currentTime >= duration - 0.2) void player.seekTo(0);
    player.play();
  };

  return (
    <View style={[styles.clip, { backgroundColor: colors.muted }]} testID={testID}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`${status.playing ? t("pause") : t("play")}: ${label}`}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary },
          pressed && styles.pressed,
        ]}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        {status.playing ? (
          <Pause size={18} color={colors.primaryForeground} />
        ) : (
          <Play size={18} color={colors.primaryForeground} />
        )}
      </Pressable>
      <View style={styles.body}>
        <Text variant="smallStrong" numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View
            style={[styles.done, { backgroundColor: colors.primary, width: `${done * 100}%` }]}
          />
        </View>
      </View>
      <Text variant="small" tone="mutedForeground">
        {clock(status.currentTime)} / {clock(duration)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: 56,
    padding: space[2],
    borderRadius: radius.md,
  },
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  pressed: { opacity: 0.8 },
  body: { flex: 1, gap: space[1] },
  track: { height: 4, borderRadius: radius.full, overflow: "hidden" },
  done: { height: 4 },
});
