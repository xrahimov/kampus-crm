import { ChevronRight, ExternalLink, FileText, Link2, Trash2, Video } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { MaterialKind, PortalMaterial } from "@/api/types";
import { Card, Divider, EmptyState } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import { groupByLesson } from "@kampus/lib/material-groups";

const KIND_ICON: Record<MaterialKind, typeof FileText> = {
  FILE: FileText,
  LINK: Link2,
  RECORDING: Video,
};

/**
 * A group's materials sorted under the lessons they belong to, as the
 * student's page (A-213) and the teacher's (A-214) both show them. `details`
 * adds what only one side knows (where a student stopped, who watched), and
 * `onDelete` puts a bin on each row.
 */
export function MaterialList<M extends PortalMaterial>({
  items,
  emptyText,
  onOpen,
  details,
  onDelete,
}: {
  items: M[];
  emptyText: string;
  onOpen: (material: M) => void;
  details?: (material: M) => Array<string | null>;
  onDelete?: (material: M) => void;
}) {
  const t = useTranslations();
  const formatDate = useDate();
  const { colors } = useTheme();
  const groups = groupByLesson(items);
  if (groups.length === 0) return <EmptyState title={emptyText} />;
  return (
    <>
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
            {group.items.map((material, index) => {
              const Icon = KIND_ICON[material.kind];
              const lines = [
                // A recording the teacher renamed still says what it is.
                material.kind === "RECORDING" && material.title !== t("portal.materials.recording")
                  ? t("portal.materials.recording")
                  : null,
                material.durationSec
                  ? t("portal.materials.duration", {
                      minutes: Math.max(1, Math.round(material.durationSec / 60)),
                    })
                  : null,
                ...(details ? details(material) : []),
              ].filter(Boolean);
              return (
                <View key={material.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.line}>
                    <Pressable
                      onPress={() => onOpen(material)}
                      accessibilityRole={material.kind === "LINK" ? "link" : "button"}
                      accessibilityLabel={material.title}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { backgroundColor: colors.muted },
                      ]}
                      testID={`material-${material.id}`}
                    >
                      <Icon size={20} color={colors.mutedForeground} />
                      <View style={styles.fill}>
                        <Text numberOfLines={2}>{material.title}</Text>
                        {lines.length > 0 ? (
                          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
                            {lines.join(", ")}
                          </Text>
                        ) : null}
                      </View>
                      {material.kind === "LINK" ? (
                        <ExternalLink size={18} color={colors.mutedForeground} />
                      ) : (
                        <ChevronRight size={20} color={colors.mutedForeground} />
                      )}
                    </Pressable>
                    {onDelete ? (
                      <Pressable
                        onPress={() => onDelete(material)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t("groups.materials.delete")}: ${material.title}`}
                        style={({ pressed }) => [
                          styles.bin,
                          { borderLeftColor: colors.border },
                          pressed && { backgroundColor: colors.muted },
                        ]}
                        testID={`material-delete-${material.id}`}
                      >
                        <Trash2 size={18} color={colors.mutedForeground} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  group: { gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "stretch" },
  row: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  bin: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
});
