import { useRouter } from "expo-router";
import {
  BookOpen,
  Building2,
  CalendarCheck,
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  Contact,
  Funnel,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  Megaphone,
  Play,
  Plug,
  Settings2,
  Smartphone,
  Sparkles,
  UserRound,
  UserRoundX,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  HELP_SEARCH_MIN,
  articleRoute,
  manualVideos,
  useManual,
  useManualSearch,
  type HelpAudience,
  type Manual,
  type ManualArticle,
} from "@/api/office-help";
import { Chip } from "@/components/chip";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Press } from "@/components/motion";
import { Card, Divider, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { radius, space, useTheme } from "@/lib/theme";

import { Markup } from "./help-parts";

/** The site's picture for each article (src/features/help/help-home.tsx); a new article gets the book. */
const ARTICLE_ICON: Record<string, LucideIcon> = {
  gettingStarted: Sparkles,
  dashboard: House,
  today: CalendarCheck,
  leads: Funnel,
  groups: Users,
  teaching: BookOpen,
  students: Contact,
  payments: Wallet,
  absences: UserRoundX,
  announcements: Megaphone,
  debts: HandCoins,
  exams: ClipboardCheck,
  testsAndCoins: GraduationCap,
  finance: Landmark,
  reports: ChartColumn,
  staffAndRoles: UserRound,
  settings: Settings2,
  integrations: Plug,
  organizations: Building2,
  studentPortal: Smartphone,
};

type Filter = HelpAudience | "ALL";

/**
 * Help (A-252): the site's Help home. One search over every article in the
 * app's language, and the articles by who they are written for, the reader's
 * own role first. The manual is the site's own, word for word; the pictures in
 * it show the site, which the app follows page by page.
 */
export function HelpHomeScreen() {
  const t = useTranslations();
  const manual = useManual();
  const header = <Header back title={t("help.nav")} />;
  if (!manual.data) return <PendingScreen header={header} query={manual} />;
  return <Home manual={manual.data} header={header} />;
}

function Home({ manual, header }: { manual: Manual; header: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const [typed, setTyped] = useState("");
  const [filter, setFilter] = useState<Filter>(manual.audience);
  const q = useRested(typed);
  const searching = q.length >= HELP_SEARCH_MIN;
  const search = useManualSearch(q);
  const hits = search.data ?? [];
  const articles = manual.articles.filter(
    (article) => filter === "ALL" || article.audiences.includes(filter),
  );
  const chosen = manual.audiences.find((audience) => audience.id === filter);
  const videoCount = manualVideos(manual).length;

  return (
    <Screen header={header}>
      <View style={styles.intro}>
        <Text variant="display">{t("help.title")}</Text>
        <Text tone="mutedForeground">{t("help.intro")}</Text>
      </View>
      <View style={styles.search}>
        <Field
          label={t("help.searchPlaceholder")}
          value={typed}
          onChangeText={setTyped}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          testID="help-search"
        />
      </View>

      {searching ? (
        <View style={styles.block} testID="help-results">
          {search.error ? (
            <Notice tone="warning" testID="help-search-problem">
              {errorText(t, search.error)}
            </Notice>
          ) : search.isLoading ? (
            <Loading />
          ) : (
            <>
              <Text variant="small" tone="mutedForeground" testID="help-results-count">
                {hits.length === 0
                  ? t("help.noResults", { query: q })
                  : t("help.results", { count: hits.length })}
              </Text>
              {hits.length > 0 ? (
                <Card style={styles.flush}>
                  {hits.map((hit, index) => (
                    <View key={`${hit.slug}-${hit.sectionId}`}>
                      {index > 0 ? <Divider /> : null}
                      <Press
                        onPress={() => router.push(articleRoute(hit.slug, hit.sectionId))}
                        accessibilityRole="button"
                        accessibilityLabel={`${hit.articleTitle}: ${hit.sectionTitle}`}
                        sink={0.99}
                        style={styles.hit}
                        testID={`help-hit-${hit.slug}-${hit.sectionId}`}
                      >
                        <Text variant="small" tone="mutedForeground">
                          {hit.articleTitle}
                        </Text>
                        <Text variant="bodyStrong">{hit.sectionTitle}</Text>
                        <Markup
                          text={hit.snippet}
                          variant="small"
                          tone="mutedForeground"
                          numberOfLines={2}
                        />
                      </Press>
                    </View>
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.block}>
            <Text variant="smallStrong">{t("help.whoAreYou")}</Text>
            <View style={styles.chips} testID="help-audiences">
              {manual.audiences.map((audience) => (
                <Chip
                  key={audience.id}
                  label={audience.title}
                  on={filter === audience.id}
                  onPress={() => setFilter(audience.id)}
                  testID={`help-audience-${audience.id}`}
                />
              ))}
              <Chip
                label={t("help.everyone")}
                on={filter === "ALL"}
                onPress={() => setFilter("ALL")}
                testID="help-audience-ALL"
              />
            </View>
            {chosen ? (
              <Text variant="small" tone="mutedForeground" testID="help-start-here">
                {chosen.startHere}
              </Text>
            ) : null}
          </View>

          {videoCount > 0 ? (
            <Press
              onPress={() => router.push("/staff/help/videos")}
              accessibilityRole="button"
              accessibilityLabel={t("help.videos")}
              sink={0.99}
              style={[styles.link, { borderColor: colors.border, backgroundColor: colors.card }]}
              testID="help-videos-link"
            >
              <View style={[styles.round, { backgroundColor: colors.sidebar }]}>
                <Play size={16} color={colors.sidebarActive} fill={colors.sidebarActive} />
              </View>
              <View style={styles.fill}>
                <Text variant="bodyStrong">{t("help.videos")}</Text>
                <Text variant="small" tone="mutedForeground">
                  {t("help.videosCount", { count: videoCount })}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </Press>
          ) : null}

          <View style={[styles.articles, wide ? styles.grid : null]} testID="help-articles">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                half={wide}
                onPress={() => router.push(articleRoute(article.slug))}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function ArticleCard({
  article,
  half,
  onPress,
}: {
  article: ManualArticle;
  /** Two to a row on a tablet. */
  half: boolean;
  onPress: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const Icon = ARTICLE_ICON[article.id] ?? BookOpen;
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      sink={0.99}
      style={[
        styles.article,
        half ? styles.half : null,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
      testID={`help-article-${article.slug}`}
    >
      <View style={[styles.square, { backgroundColor: colors.sidebar }]}>
        <Icon size={18} color={colors.sidebarActive} strokeWidth={1.75} />
      </View>
      <View style={styles.fill}>
        <Text variant="bodyStrong">{article.title}</Text>
        <Text variant="small" tone="mutedForeground" numberOfLines={3}>
          {article.summary}
        </Text>
        <Text variant="small" tone="mutedForeground" style={styles.count}>
          {t("help.sectionCount", { count: article.sections.length })}
        </Text>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  intro: { gap: space[1] },
  // On a tablet the search stays the width a question is typed at.
  search: { width: "100%", maxWidth: 640 },
  block: { gap: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  hit: { paddingHorizontal: space[4], paddingVertical: space[3], gap: 2 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  square: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  articles: { gap: space[3] },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  article: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[4],
  },
  // Two to a row with the gap between them taken off each.
  half: { flexBasis: "48%", flexGrow: 1 },
  count: { marginTop: space[2] },
});
