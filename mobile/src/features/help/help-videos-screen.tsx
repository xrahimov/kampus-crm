import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { articleRoute, manualVideos, useManual } from "@/api/office-help";
import { Header } from "@/components/header";
import { Press } from "@/components/motion";
import { EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space } from "@/lib/theme";

import { VideoCard } from "./help-parts";

/**
 * How-to videos (A-252), as the site's `/help/videos`: every video the server
 * has in the app's language, in the manual's order, each with the way to the
 * steps it shows. They are recordings of the site; the app follows the site
 * page by page, so the steps are the same.
 */
export function HelpVideosScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { wide } = useLayout();
  const manual = useManual();
  const header = <Header back title={t("help.nav")} />;
  if (!manual.data) return <PendingScreen header={header} query={manual} />;
  const videos = manualVideos(manual.data);
  return (
    <Screen header={header}>
      <View style={styles.intro}>
        <Text variant="display">{t("help.videos")}</Text>
        <Text tone="mutedForeground">{t("help.videosIntro")}</Text>
      </View>
      {videos.length === 0 ? (
        <EmptyState title={t("help.noVideos")} />
      ) : (
        <View style={[styles.list, wide ? styles.grid : null]} testID="help-videos">
          {videos.map(({ video, article, sectionId }) => (
            <View key={video.id} style={[styles.item, wide ? styles.half : null]}>
              <VideoCard video={video} />
              <Press
                onPress={() => router.push(articleRoute(article.slug, sectionId))}
                accessibilityRole="link"
                sink={0.99}
                style={styles.steps}
                testID={`help-video-steps-${video.id}`}
              >
                <Text variant="smallStrong" tone="primary">
                  {t("help.readSteps", { article: article.title })}
                </Text>
              </Press>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space[1] },
  list: { gap: space[4] },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  item: { gap: space[1] },
  half: { flexBasis: "48%", flexGrow: 1 },
  // A link under its video, with room for a thumb.
  steps: { alignSelf: "flex-start", paddingVertical: space[2], paddingHorizontal: space[1] },
});
