import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";

import { articleRoute, useManual, type Manual, type ManualArticle } from "@/api/office-help";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Press } from "@/components/motion";
import { Card, Divider, EmptyState, Notice, Screen, type ScreenScroll } from "@/components/surface";
import { Text } from "@/components/text";
import { nativeRoute, useOpenPath } from "@/features/office/site-paths";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

import { Blocks, Picture, VideoCard } from "./help-parts";

/**
 * One article of the manual (A-252), as the site's `/help/<slug>`: what it is
 * about and who it is written for, the page it describes one press away, its
 * sections in order with their video, picture and steps, and the articles
 * before and after it. "On this page" lists the sections on a phone too: an
 * article is long under a thumb, and the list goes straight to the part
 * wanted. A search result opens the article at its section.
 */
export function HelpArticleScreen() {
  const { slug, section } = useLocalSearchParams<{ slug: string; section?: string }>();
  const t = useTranslations();
  const manual = useManual();
  const header = <Header back title={t("help.nav")} />;
  if (!manual.data) return <PendingScreen header={header} query={manual} />;
  const index = manual.data.articles.findIndex((article) => article.slug === slug);
  const article = manual.data.articles[index];
  // An article the reader may not open is not in their manual: it reads as "not found".
  if (!article) {
    return (
      <Screen header={header}>
        <EmptyState title={t("common.nothingFound")} />
      </Screen>
    );
  }
  return (
    // Another article is another page: it starts at its top with nothing measured.
    <Article
      key={article.id}
      manual={manual.data}
      article={article}
      index={index}
      section={section}
      header={header}
    />
  );
}

function Article({
  manual,
  article,
  index,
  section,
  header,
}: {
  manual: Manual;
  article: ManualArticle;
  index: number;
  section: string | undefined;
  header: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { colors } = useTheme();
  const { open, error } = useOpenPath();
  const scroll = useRef<ScreenScroll>(null);
  // Where the article and each of its sections start, as the page lays them out.
  const top = useRef(0);
  const starts = useRef<Record<string, number>>({});
  const [laidOut, setLaidOut] = useState(0);
  const arrived = useRef(false);

  const goTo = (id: string, animated: boolean) => {
    const start = starts.current[id];
    if (start !== undefined) scroll.current?.to(top.current + start, animated);
  };
  // Opened from a search result: once the section's place is known, the page is there.
  useEffect(() => {
    if (!section || arrived.current || starts.current[section] === undefined) return;
    arrived.current = true;
    goTo(section, false);
  }, [section, laidOut]);

  const measured = (id: string) => (event: LayoutChangeEvent) => {
    const y = Math.round(event.nativeEvent.layout.y);
    if (starts.current[id] === y) return;
    starts.current[id] = y;
    if (id === section && !arrived.current) setLaidOut((n) => n + 1);
  };

  const roles = article.audiences
    .map((id) => manual.audiences.find((audience) => audience.id === id)?.title)
    .filter(Boolean)
    .join(", ");
  const previous = manual.articles[index - 1];
  const next = manual.articles[index + 1];
  const onSite = article.path ? nativeRoute(article.path) === null : false;

  return (
    <Screen header={header} scrollRef={scroll}>
      <View
        style={styles.article}
        onLayout={(event) => {
          top.current = Math.round(event.nativeEvent.layout.y);
        }}
        testID="help-article"
      >
        <View style={styles.head}>
          <Text variant="display" accessibilityRole="header">
            {article.title}
          </Text>
          <Text tone="mutedForeground">{article.summary}</Text>
          <Text variant="small" tone="mutedForeground" testID="help-written-for">
            {t("help.writtenFor", { roles })}
          </Text>
          {error ? <Notice tone="destructive">{error}</Notice> : null}
          {article.path ? (
            <Button
              compact
              variant="outline"
              label={t("help.openPage")}
              icon={onSite ? <ExternalLink size={16} color={colors.foreground} /> : undefined}
              onPress={() => open(article.path!)}
              style={styles.start}
              testID="help-open-page"
            />
          ) : null}
        </View>

        {article.sections.length > 1 ? (
          <View style={styles.tight}>
            <Text variant="smallStrong" tone="mutedForeground">
              {t("help.onThisPage")}
            </Text>
            <Card style={styles.flush} testID="help-on-this-page">
              {article.sections.map((one, at) => (
                <View key={one.id}>
                  {at > 0 ? <Divider /> : null}
                  <Press
                    onPress={() => goTo(one.id, true)}
                    accessibilityRole="button"
                    accessibilityLabel={one.title}
                    sink={0.99}
                    style={styles.row}
                    testID={`help-go-${one.id}`}
                  >
                    <Text style={styles.fill}>{one.title}</Text>
                    <ChevronRight size={18} color={colors.mutedForeground} />
                  </Press>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {article.sections.map((one) => (
          <View
            key={one.id}
            style={styles.section}
            onLayout={measured(one.id)}
            testID={`help-section-${one.id}`}
          >
            <Text variant="title" accessibilityRole="header">
              {one.title}
            </Text>
            {one.video ? <VideoCard video={one.video} /> : null}
            {one.screenshot ? <Picture picture={one.screenshot} caption={one.title} /> : null}
            <Blocks body={one.body} />
            {one.more.map((picture) => (
              <Picture key={picture.src} picture={picture} caption={one.title} />
            ))}
          </View>
        ))}

        {previous || next ? (
          <View style={[styles.neighbours, { borderTopColor: colors.border }]}>
            {previous ? (
              <Neighbour
                way="previous"
                title={previous.title}
                onPress={() => router.replace(articleRoute(previous.slug))}
              />
            ) : null}
            {next ? (
              <Neighbour
                way="next"
                title={next.title}
                onPress={() => router.replace(articleRoute(next.slug))}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** The article before or after this one. It takes this one's place: Back still goes to Help. */
function Neighbour({
  way,
  title,
  onPress,
}: {
  way: "previous" | "next";
  title: string;
  onPress: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const Arrow = way === "previous" ? ArrowLeft : ArrowRight;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(`help.${way}`)}: ${title}`}
      sink={0.99}
      style={[
        styles.neighbour,
        way === "next" ? styles.reverse : null,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
      testID={`help-${way}`}
    >
      <Arrow size={18} color={colors.mutedForeground} />
      <View style={styles.fill}>
        <Text
          variant="small"
          tone="mutedForeground"
          style={way === "next" ? styles.end : undefined}
        >
          {t(`help.${way}`)}
        </Text>
        <Text variant="bodyStrong" style={way === "next" ? styles.end : undefined}>
          {title}
        </Text>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // A column a line of text is read at, on a tablet too.
  article: { width: "100%", maxWidth: 720, alignSelf: "center", gap: space[6] },
  head: { gap: space[2] },
  start: { alignSelf: "flex-start", marginTop: space[1] },
  tight: { gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    minHeight: 48,
    paddingVertical: space[2],
  },
  section: { gap: space[3] },
  neighbours: { gap: space[3], borderTopWidth: 1, paddingTop: space[5] },
  neighbour: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  reverse: { flexDirection: "row-reverse" },
  end: { textAlign: "right" },
});
