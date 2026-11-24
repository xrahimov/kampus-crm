import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Lightbulb, Maximize2, Play } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";

import type { HelpBlock, ManualPicture, ManualVideo } from "@/api/office-help";
import { Animated, Press, appear } from "@/components/motion";
import { Text, type TextProps } from "@/components/text";
import { fileRoute } from "@/features/files/file-screen";
import { API_ORIGIN } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { font, radius, space, useTheme } from "@/lib/theme";

/*
 * What an article of the manual is made of in the app (A-252): its text with
 * the names of buttons marked, numbered steps, notes, pictures and videos.
 * The site draws the same pieces in `src/features/help`.
 */

/** A picture taller than this is held to it: a phone's screen would fill three of the reader's. */
const PICTURE_MAX_HEIGHT = 460;

/**
 * Manual text. `**Save**` in it is the name of a button or a field as the
 * screen shows it: it is marked so the eye finds the same word on the page.
 */
export function Markup({ text, ...rest }: { text: string } & Omit<TextProps, "children">) {
  const { colors } = useTheme();
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <Text {...rest}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text
            key={index}
            style={[
              styles.label,
              { backgroundColor: colors.accent, color: colors.accentForeground },
            ]}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** The text of one section: paragraphs, steps in their order, and notes set apart. */
export function Blocks({ body }: { body: HelpBlock[] }) {
  const { colors } = useTheme();
  return (
    <>
      {body.map((block, index) => {
        if (typeof block === "string") {
          return <Markup key={index} text={block} style={styles.reading} />;
        }
        if ("steps" in block) {
          return (
            <View key={index} style={styles.steps} testID="help-steps">
              {block.steps.map((step, at) => (
                <View key={at} style={styles.step}>
                  <View style={[styles.number, { backgroundColor: colors.primary }]}>
                    <Text variant="smallStrong" tone="primaryForeground">
                      {at + 1}
                    </Text>
                  </View>
                  <Markup text={step} style={[styles.reading, styles.fill]} />
                </View>
              ))}
            </View>
          );
        }
        return (
          <View
            key={index}
            style={[
              styles.note,
              { borderLeftColor: colors.saffron, backgroundColor: colors.muted },
            ]}
            testID="help-note"
          >
            <Lightbulb size={16} color={colors.saffron} style={styles.noteIcon} />
            <Markup text={block.note} variant="small" style={styles.fill} />
          </View>
        );
      })}
    </>
  );
}

/**
 * A picture of the manual at its own shape: the room for it is kept before it
 * arrives, so the text under it does not jump. Most are a whole page of the
 * site, too small to read on a phone, so a press opens the picture where it
 * can be enlarged with two fingers.
 */
export function Picture({ picture, caption }: { picture: ManualPicture; caption: string }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Press
      onPress={() => router.push(fileRoute(picture.src, caption))}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${caption}. ${t("mobile.help.enlarge")}`}
      sink={0.99}
      style={[styles.frame, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="help-picture"
    >
      <Image
        source={{ uri: `${API_ORIGIN}${picture.src}` }}
        resizeMode="contain"
        testID="help-picture-image"
        style={[
          styles.picture,
          { maxWidth: picture.width, aspectRatio: picture.width / picture.height },
        ]}
      />
      <View style={[styles.enlarge, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Maximize2 size={14} color={colors.mutedForeground} />
      </View>
    </Press>
  );
}

/**
 * A how-to video of the manual. As on the site, nothing of it is fetched until
 * the reader presses play: the row stands in for the video, so an article or
 * the videos page with many of them costs nothing to open. The videos are
 * recordings of the site, wider than tall; full screen is in the player's own
 * controls.
 */
export function VideoCard({ video }: { video: ManualVideo }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  return (
    <View
      style={[styles.frame, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID={`help-video-${video.id}`}
    >
      {playing ? (
        <Animated.View entering={appear} style={styles.stage}>
          <Player url={`${API_ORIGIN}${video.src}`} title={video.title} />
        </Animated.View>
      ) : null}
      <Press
        onPress={() => setPlaying(true)}
        disabled={playing}
        accessibilityRole="button"
        accessibilityLabel={`${t("help.video")}: ${video.title}`}
        sink={0.985}
        style={styles.videoRow}
        testID={`help-video-play-${video.id}`}
      >
        {playing ? null : (
          <View style={[styles.play, { backgroundColor: colors.sidebar }]}>
            <Play size={16} color={colors.sidebarActive} fill={colors.sidebarActive} />
          </View>
        )}
        <View style={styles.fill}>
          <Text variant="small" tone="mutedForeground">
            {t("help.video")}
          </Text>
          <Text variant="bodyStrong">{video.title}</Text>
          {video.note ? (
            <Text variant="small" tone="mutedForeground">
              {video.note}
            </Text>
          ) : null}
        </View>
      </Press>
    </View>
  );
}

function Player({ url, title }: { url: string; title: string }) {
  const player = useVideoPlayer(url, (made) => made.play());
  // In a browser the film can only start once its picture is on the page.
  useEffect(() => {
    if (Platform.OS === "web") player.play();
  }, [player]);
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      allowsVideoFrameAnalysis={false}
      accessibilityLabel={title}
      style={styles.video}
      testID="help-video-player"
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // A manual is read, not scanned: a little more air between the lines than a list's text.
  reading: { lineHeight: 24 },
  label: { fontFamily: font.medium },
  steps: { gap: space[3] },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    flexDirection: "row",
    gap: space[3],
    borderLeftWidth: 3,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  noteIcon: { marginTop: 1 },
  frame: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  picture: { width: "100%", maxHeight: PICTURE_MAX_HEIGHT, alignSelf: "center" },
  enlarge: {
    position: "absolute",
    right: space[2],
    bottom: space[2],
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stage: { backgroundColor: "#000" },
  // The site's films are recorded twice as wide as tall (scripts/tutorial-videos/film.ts).
  video: { width: "100%", aspectRatio: 2 },
  videoRow: {
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
});
