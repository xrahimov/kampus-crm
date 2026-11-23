import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, ExternalLink, FileText, Link2, Video } from "lucide-react-native";
import { useCallback } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { usePortalMaterials } from "@/api/portal";
import type { MaterialKind, PortalMaterial } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Loading, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { fileRoute } from "@/features/files/file-screen";
import { clock } from "@/features/room/file-source";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import { groupByLesson } from "@kampus/lib/material-groups";

const KIND_ICON: Record<MaterialKind, typeof FileText> = {
  FILE: FileText,
  LINK: Link2,
  RECORDING: Video,
};

/** A place this close to the start is not worth naming. */
const RESUME_FROM_SEC = 5;

/**
 * The group's materials as the student sees them, in the app (A-213): files,
 * links and lesson recordings, sorted under the lessons they belong to. A file
 * or a recording opens inside the app; a link opens where links open.
 */
export function MaterialsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const formatDate = useDate();
  const portal = usePortal(token);
  const query = usePortalMaterials(token);
  const { refetch } = query;
  // Coming back from a recording shows the new place to continue from.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const header = (
    <Header back title={t("portal.tabs.materials")} subtitle={portal.data?.portal.group.name} />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }
  const groups = groupByLesson(query.data);
  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.list}
    >
      {groups.length === 0 ? <EmptyState title={t("portal.materials.empty")} /> : null}
      {groups.map((group) => (
        <View key={group.key} style={styles.group} testID="materials-group">
          <View>
            <Text variant="bodyStrong">
              {group.lessonDate
                ? t("portal.materials.lessonOf", {
                    date: formatDate(dayAsDate(group.lessonDate), {
                      day: "numeric",
                      month: "short",
                    }),
                  })
                : t("portal.materials.general")}
            </Text>
            {group.lessonTopic ? (
              <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                {group.lessonTopic}
              </Text>
            ) : null}
          </View>
          <Card style={styles.flush}>
            {group.items.map((material, index) => (
              <View key={material.id}>
                {index > 0 ? <Divider /> : null}
                <MaterialRow token={token} material={material} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

function MaterialRow({ token, material }: { token: string; material: PortalMaterial }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const router = useRouter();
  const Icon = KIND_ICON[material.kind];
  const resume = material.resumeSec ?? 0;

  const open = () => {
    if (material.kind === "LINK") {
      void Linking.openURL(material.url).catch(() => undefined);
      return;
    }
    router.push(
      material.kind === "RECORDING"
        ? fileRoute(material.url, material.title, {
            token,
            material: material.id,
            stream: material.hlsUrl,
            resume,
          })
        : fileRoute(material.url, material.title),
    );
  };

  const details = [
    // A recording the teacher renamed still says what it is.
    material.kind === "RECORDING" && material.title !== t("portal.materials.recording")
      ? t("portal.materials.recording")
      : null,
    material.durationSec
      ? t("portal.materials.duration", {
          minutes: Math.max(1, Math.round(material.durationSec / 60)),
        })
      : null,
    material.kind === "RECORDING" && resume > RESUME_FROM_SEC
      ? t("mobile.materials.continueFrom", { time: clock(resume) })
      : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={open}
      accessibilityRole={material.kind === "LINK" ? "link" : "button"}
      accessibilityLabel={material.title}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
      testID={`material-${material.id}`}
    >
      <Icon size={20} color={colors.mutedForeground} />
      <View style={styles.fill}>
        <Text numberOfLines={2}>{material.title}</Text>
        {details.length > 0 ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {details.join(", ")}
          </Text>
        ) : null}
      </View>
      {material.kind === "LINK" ? (
        <ExternalLink size={18} color={colors.mutedForeground} />
      ) : (
        <ChevronRight size={20} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[6] },
  group: { gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
