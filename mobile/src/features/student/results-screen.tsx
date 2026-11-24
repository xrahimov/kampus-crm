import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform, Share, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { usePortalBadges, usePortalGradebook } from "@/api/portal";
import { usePortalCertificates } from "@/api/portal-own";
import type { Portal, PortalCertificate, PortalGradebook } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { BadgeTiles } from "@/features/badges/badge-tiles";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space } from "@/lib/theme";

import { Meter } from "./meter";

/**
 * How the student is doing, in the app (A-215): the grade in the course part
 * by part, the badges earned and still to earn, certificates (A-216), exams
 * and the tests taken.
 */
export function ResultsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
  const portal = usePortal(token);
  const gradebook = usePortalGradebook(token);
  const badges = usePortalBadges(token);
  const certificates = usePortalCertificates(token);

  const header = (
    <Header back title={t("portal.tabs.results")} subtitle={portal.data?.portal.group.name} />
  );
  if (!portal.data) return <PendingScreen header={header} query={portal} />;
  const refresh = () => {
    void portal.refetch();
    void gradebook.refetch();
    void badges.refetch();
    void certificates.refetch();
  };
  const grade = gradebook.data ? <Gradebook data={gradebook.data} /> : null;
  const earned = badges.data ? <BadgeTiles badges={badges.data} title={t("badges.title")} /> : null;
  const taken = (
    <>
      {certificates.data && certificates.data.length > 0 ? (
        <Certificates certificates={certificates.data} />
      ) : null}
      <Exams portal={portal.data.portal} />
      <Tests portal={portal.data.portal} />
    </>
  );
  return (
    <Screen
      header={header}
      onRefresh={refresh}
      refreshing={portal.isRefetching}
      contentStyle={wide ? styles.split : styles.block}
    >
      {wide ? (
        <>
          <View style={styles.column}>
            {grade}
            {taken}
          </View>
          <View style={styles.column}>{earned}</View>
        </>
      ) : (
        <>
          {grade}
          {earned}
          {taken}
        </>
      )}
    </Screen>
  );
}

function Gradebook({ data }: { data: PortalGradebook }) {
  const t = useTranslations("portal.gradebook");
  const shown = data.categories.filter((c) => c.weight > 0);
  return (
    <Card testID="gradebook">
      <Text variant="heading">{t("title", { course: data.courseName })}</Text>
      <View style={styles.line}>
        <Text variant="title" testID="gradebook-final">
          {data.final === null ? t("noGrade") : `${data.final}%`}
        </Text>
        {data.level ? <Badge tone="accent" label={data.level} /> : null}
      </View>
      <Meter percent={data.final} label={t("final")} />
      {shown.map((category) => (
        <View key={category.key} style={styles.line} testID={`gradebook-${category.key}`}>
          <View style={styles.fill}>
            <Text>{t(`categories.${category.key}`)}</Text>
            <Text variant="small" tone="mutedForeground">
              {t("weight", { percent: category.weight })}
            </Text>
          </View>
          <Text variant="figure">
            {category.percent === null ? t("none") : `${category.percent}%`}
          </Text>
        </View>
      ))}
      <Text variant="small" tone="mutedForeground">
        {t("hint")}
      </Text>
    </Card>
  );
}

function Exams({ portal }: { portal: Portal }) {
  const t = useTranslations("portal.results");
  const formatDate = useDate();
  return (
    <Card testID="exams">
      <Text variant="heading">{t("exams")}</Text>
      {portal.exams.length === 0 ? (
        <Text variant="small" tone="mutedForeground">
          {t("noExams")}
        </Text>
      ) : null}
      {portal.exams.map((exam, index) => {
        const outcome: { label: string; tone: Tone } = !exam.isPresent
          ? { label: t("missed"), tone: "warning" }
          : exam.passed === null
            ? { label: t("pending"), tone: "neutral" }
            : exam.passed
              ? { label: t("passed"), tone: "success" }
              : { label: t("failed"), tone: "destructive" };
        return (
          <View key={exam.id} style={styles.rows}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.line} testID={`exam-${exam.id}`}>
              <View style={styles.fill}>
                <Text>{exam.name}</Text>
                <Text variant="small" tone="mutedForeground">
                  {[formatDate(dayAsDate(exam.date), { dateStyle: "medium" }), exam.level]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
              {exam.score !== null ? (
                <Text variant="figure">
                  {exam.score} / {exam.maxScore}
                </Text>
              ) : null}
              <Badge tone={outcome.tone} label={outcome.label} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/**
 * The student's certificates. Each has a public page anyone may open to check
 * it: **Open** shows that page over the app, **Share** hands its link to the
 * phone's share sheet.
 */
function Certificates({ certificates }: { certificates: PortalCertificate[] }) {
  const t = useTranslations();
  const formatDate = useDate();
  const open = (url: string) =>
    void (
      Platform.OS === "web"
        ? Linking.openURL(url)
        : WebBrowser.openBrowserAsync(url, { enableBarCollapsing: true })
    ).catch(() => undefined);
  return (
    <Card testID="certificates">
      <Text variant="heading">{t("portal.results.certificates")}</Text>
      {certificates.map((certificate, index) => (
        <View key={certificate.id} style={styles.rows}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.rows} testID={`certificate-${certificate.id}`}>
            <View>
              <Text variant="bodyStrong">
                {[certificate.title, certificate.level].filter(Boolean).join(", ")}
              </Text>
              <Text variant="small" tone="mutedForeground">
                {t("portal.results.certificateMeta", {
                  number: certificate.number,
                  date: formatDate(dayAsDate(certificate.issuedAt), { dateStyle: "medium" }),
                })}
              </Text>
            </View>
            <View style={styles.line}>
              <Button
                compact
                variant="outline"
                label={t("portal.results.openCertificate")}
                onPress={() => open(certificate.url)}
                testID={`certificate-open-${certificate.id}`}
              />
              <Button
                compact
                variant="ghost"
                label={t("mobile.certificates.share")}
                onPress={() =>
                  void Share.share({ message: certificate.url }).catch(() => undefined)
                }
                testID={`certificate-share-${certificate.id}`}
              />
            </View>
          </View>
        </View>
      ))}
      <Text variant="small" tone="mutedForeground">
        {t("portal.results.certificateHint")}
      </Text>
    </Card>
  );
}

function Tests({ portal }: { portal: Portal }) {
  const t = useTranslations("portal.results");
  const formatDate = useDate();
  return (
    <Card testID="test-results">
      <Text variant="heading">{t("tests")}</Text>
      {portal.tests.length === 0 ? (
        <Text variant="small" tone="mutedForeground">
          {t("noTests")}
        </Text>
      ) : null}
      {portal.tests.map((test, index) => (
        <View key={test.id} style={styles.rows}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.line} testID={`test-result-${test.id}`}>
            <View style={styles.fill}>
              <Text>{test.testName}</Text>
              <Text variant="small" tone="mutedForeground">
                {[test.subject, formatDate(new Date(test.submittedAt), { dateStyle: "medium" })]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </View>
            <Text variant="figure">
              {test.score} / {test.maxScore}
            </Text>
            <Text tone="mutedForeground">{test.percent}%</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  column: { flex: 1, gap: space[4] },
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rows: { gap: space[3] },
});
