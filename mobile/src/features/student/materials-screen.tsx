import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { Linking, StyleSheet } from "react-native";

import { usePortal } from "@/api/hooks";
import { usePortalMaterials } from "@/api/portal";
import type { PortalMaterial } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { EmptyState, Loading, Screen } from "@/components/surface";
import { fileRoute } from "@/features/files/file-screen";
import { clock } from "@/features/room/file-source";
import { MaterialList } from "@/features/shared/material-list";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

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
  const router = useRouter();
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
  const open = (material: PortalMaterial) => {
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
            resume: material.resumeSec ?? 0,
          })
        : fileRoute(material.url, material.title),
    );
  };
  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.list}
    >
      <MaterialList
        items={query.data}
        emptyText={t("portal.materials.empty")}
        onOpen={open}
        details={(material) => [
          material.kind === "RECORDING" && (material.resumeSec ?? 0) > RESUME_FROM_SEC
            ? t("mobile.materials.continueFrom", { time: clock(material.resumeSec ?? 0) })
            : null,
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[6] },
});
