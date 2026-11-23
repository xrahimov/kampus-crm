import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { Play } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Animated, Press, appear } from "@/components/motion";
import { Text } from "@/components/text";
import { apiUrl } from "@/lib/api";
import { useLocaleChoice, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

/** The how-to videos the sign-in screen offers: one for staff, one for students and parents. */
export type HowToVideoId = "sign-in" | "student-portal";

/**
 * The how-to video under the sign-in form, as on the site's sign-in pages
 * (A-199, A-229): one row that opens into the player. The videos are files on
 * the Kampus server, one per language, open to everyone; a server without the
 * video of this language shows nothing. Nothing of the video itself is fetched
 * until the row is pressed.
 */
export function HowToVideo({ id }: { id: HowToVideoId }) {
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const url = apiUrl(`/help-videos/${locale}/${id}`);
  const there = useQuery({
    queryKey: ["how-to-video", url],
    queryFn: () => hasVideo(url),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Which video is open, not a yes or no: another language or the other door starts closed.
  const [open, setOpen] = useState<string | null>(null);
  if (!there.data) return null;

  const title = t(id === "sign-in" ? "mobile.video.signIn" : "mobile.video.student");
  if (open === url) {
    return (
      <Animated.View entering={appear} style={styles.frame} testID="how-to-video">
        <Player url={url} title={title} />
      </Animated.View>
    );
  }
  return (
    <Press
      onPress={() => setOpen(url)}
      accessibilityRole="button"
      accessibilityLabel={`${t("help.video")}: ${title}`}
      sink={0.985}
      // It shows once the server has answered: it comes in, it does not pop.
      arrives
      style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="how-to-video-play"
    >
      <View style={[styles.play, { backgroundColor: colors.sidebar }]}>
        <Play size={16} color={colors.sidebarActive} fill={colors.sidebarActive} />
      </View>
      <View style={styles.words}>
        <Text variant="small" tone="mutedForeground">
          {t("help.video")}
        </Text>
        <Text variant="bodyStrong">{title}</Text>
      </View>
    </Press>
  );
}

function Player({ url, title }: { url: string; title: string }) {
  const player = useVideoPlayer(url, (made) => made.play());
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      allowsVideoFrameAnalysis={false}
      accessibilityLabel={title}
      style={styles.video}
      testID="how-to-video-player"
    />
  );
}

/** Whether the server has this video: one byte is asked for, not the film. */
async function hasVideo(url: string): Promise<boolean> {
  try {
    const answer = await fetch(url, { headers: { Range: "bytes=0-0" } });
    return answer.ok;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  words: { flexShrink: 1 },
  frame: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000" },
  video: { width: "100%", aspectRatio: 16 / 9 },
});
