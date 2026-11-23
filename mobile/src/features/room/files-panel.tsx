import { FileText, Film, Image as ImageIcon, Link2, Music, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { API_ORIGIN } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { radius, space } from "@/lib/theme";
import { materialView, type MaterialView } from "@kampus/lib/video-material";
import type { CallEngine } from "@kampus/lib/video/call-engine";

import { room } from "./look";

/** The lesson beside the call, as the server answers a participant (the site's lesson panel reads the same). */
export interface CallLesson {
  materials: {
    id: string;
    kind: "FILE" | "LINK" | "RECORDING";
    title: string;
    url: string;
    /** True for the group's general materials, not tied to this lesson. */
    general: boolean;
  }[];
}

/** The lesson's materials for someone in the room; the room's own secret is the key. */
export async function fetchCallLesson(
  self: { participantId: string; secret: string },
  origin: string = API_ORIGIN,
): Promise<CallLesson> {
  const response = await fetch(`${origin}/api/v1/video/peers/${self.participantId}/lesson`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({ secret: self.secret }),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as CallLesson;
}

function KindIcon({ view }: { view: MaterialView }) {
  const color = room.inkMuted;
  if (view === "image") return <ImageIcon size={18} color={color} />;
  if (view === "video" || view === "youtube") return <Film size={18} color={color} />;
  if (view === "audio") return <Music size={18} color={color} />;
  if (view === "link") return <Link2 size={18} color={color} />;
  return <FileText size={18} color={color} />;
}

/**
 * The teacher's list of what can go on everyone's screen (A-210): the lesson's
 * materials first, then the group's. One press shows a file; the one that is
 * shown has "Stop showing".
 */
export function FilesPanel({ engine, onShown }: { engine: CallEngine; onShown: () => void }) {
  const t = useTranslations("video.lesson");
  const tm = useTranslations("mobile.room.files");
  const [data, setData] = useState<CallLesson | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const shownId = engine.currentStage.material?.id ?? null;

  useEffect(() => {
    let alive = true;
    fetchCallLesson(engine.self)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [engine, reloads]);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("failed")}</Text>
        <Pressable
          onPress={() => {
            setFailed(false);
            setReloads((n) => n + 1);
          }}
          accessibilityRole="button"
          style={styles.retry}
          testID="files-retry"
        >
          <RefreshCw size={16} color={room.ink} />
          <Text variant="smallStrong" style={styles.ink}>
            {t("retry")}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={room.ink} />
      </View>
    );
  }
  // The lesson's own files first: they are why the teacher opened this.
  const materials = [...data.materials].sort((a, b) => Number(a.general) - Number(b.general));
  return (
    <ScrollView contentContainerStyle={styles.list} testID="files-list">
      <Text variant="small" style={styles.muted}>
        {tm("hint")}
      </Text>
      {materials.length === 0 ? (
        <Text style={styles.muted} testID="files-empty">
          {t("noMaterials")}
        </Text>
      ) : null}
      {materials.map((m) => {
        const view = materialView(m.kind, m.url);
        const shown = shownId === m.id;
        return (
          <View key={m.id} style={[styles.row, shown && styles.rowShown]} testID={`file-${m.id}`}>
            <KindIcon view={view} />
            <View style={styles.name}>
              <Text style={styles.ink} numberOfLines={2}>
                {m.title}
              </Text>
              {shown ? (
                <Text variant="small" style={styles.active}>
                  {tm("shown")}
                </Text>
              ) : m.general ? (
                <Text variant="small" style={styles.muted}>
                  {t("general")}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                if (shown) {
                  engine.hideMaterial();
                  return;
                }
                engine.showMaterial({ id: m.id, title: m.title, kind: m.kind, view, url: m.url });
                onShown();
              }}
              accessibilityRole="button"
              accessibilityLabel={
                shown ? t("stopShowing", { title: m.title }) : t("show", { title: m.title })
              }
              style={({ pressed }) => [
                styles.action,
                shown && styles.actionStop,
                pressed && styles.pressed,
              ]}
              testID={shown ? `file-stop-${m.id}` : `file-show-${m.id}`}
            >
              <Text variant="smallStrong" style={shown ? styles.ink : styles.actionText}>
                {shown ? tm("stop") : tm("show")}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: space[3] },
  list: { gap: space[2], padding: space[3], paddingTop: 0 },
  ink: { color: room.ink },
  muted: { color: room.inkMuted },
  active: { color: room.active },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    height: 40,
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    backgroundColor: room.surfaceRaised,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    padding: space[3],
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
  },
  rowShown: { borderWidth: 1, borderColor: room.active },
  name: { flex: 1, gap: 2 },
  action: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: room.active,
  },
  actionStop: { backgroundColor: room.border },
  actionText: { color: room.activeInk },
  pressed: { opacity: 0.75 },
});
