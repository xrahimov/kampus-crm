import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { Play } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Animated, Press, appear } from "@/components/motion";
import { Text } from "@/components/text";
import { apiUrl } from "@/lib/api";
import { useLocaleChoice, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * The how-to videos the sign-in screen offers: one for staff, one for students
 * and parents. They are the ones recorded in the app (`APP_HELP_VIDEO_IDS` on
 * the site's side), not the site's own: those show a browser and say there is
 * nothing to install.
 */
export type HowToVideoId = "app-sign-in" | "app-student";

/**
 * What a first sign-in takes, under the sign-in form (A-229): the how-to video
 * of the site's sign-in pages (A-199) as one row that opens into the player,
 * and under it the line that a new account is approved by the centre's staff.
 * The line always shows. The videos are files on the Kampus server, one per
 * language, open to everyone; a server without the app's video of this
 * language shows the line alone. Nothing of the video itself is fetched until the row
 * is pressed.
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

  // One title at both doors (kai): what the person is here for, not the film's own name.
  const title = t("auth.firstSignIn.video");
  return (
    <View
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="first-sign-in"
    >
      {!there.data ? null : open === url ? (
        <Animated.View entering={appear} style={styles.frame} testID="how-to-video">
          <Player url={url} title={title} />
        </Animated.View>
      ) : (
        <Press
          onPress={() => setOpen(url)}
          accessibilityRole="button"
          accessibilityLabel={`${t("help.video")}: ${title}`}
          sink={0.985}
          // It shows once the server has answered: it comes in, it does not pop.
          arrives
          style={styles.row}
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
      )}
      <Text
        variant="small"
        tone="mutedForeground"
        style={[styles.note, { backgroundColor: colors.muted }]}
        testID="first-sign-in-note"
      >
        {t("auth.firstSignIn.note")}
      </Text>
    </View>
  );
}

/**
 * The app's videos are upright, like the phone they were recorded for: the
 * player takes most of the screen's height and stands in the middle of the
 * card; full screen is one press away in its own controls.
 */
function Player({ url, title }: { url: string; title: string }) {
  const player = useVideoPlayer(url, (made) => made.play());
  const { height } = useWindowDimensions();
  const tall = Math.round(Math.min(Math.max(height * 0.62, 320), 620));
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      allowsVideoFrameAnalysis={false}
      accessibilityLabel={title}
      style={[styles.video, { height: tall, width: Math.round((tall * 9) / 16) }]}
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
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  words: { flexShrink: 1 },
  note: { paddingHorizontal: space[4], paddingVertical: space[3] },
  frame: { backgroundColor: "#000", alignItems: "center" },
  video: { maxWidth: "100%" },
});
