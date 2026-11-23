import {
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Music,
  Paperclip,
  RefreshCw,
} from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { addGroupFile } from "@/api/group-pages";
import { Text } from "@/components/text";
import { chooseFile, choosePhoto, type Picked } from "@/features/files/pick";
import { API_ORIGIN } from "@/lib/api";
import { errorText, useTranslations } from "@/lib/i18n";
import { radius, space } from "@/lib/theme";
import { materialView, type MaterialView } from "@kampus/lib/video-material";
import type { CallEngine } from "@kampus/lib/video/call-engine";

import { room } from "./look";

/** The lesson beside the call, as the server answers a participant (the site's lesson panel reads the same). */
export interface CallLesson {
  lesson: { id: string } | null;
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
export function FilesPanel({
  engine,
  groupId,
  onShown,
}: {
  engine: CallEngine;
  /** The group whose materials a teacher may add to from this device (A-214). */
  groupId?: string;
  onShown: () => void;
}) {
  const t = useTranslations("video.lesson");
  const tm = useTranslations("mobile.room.files");
  const th = useTranslations("mobile.homework");
  const te = useTranslations();
  const [data, setData] = useState<CallLesson | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const lessonId = data?.lesson?.id ?? null;

  // A file from this device joins the lesson's materials, then the list is read again.
  const add = async (from: () => Promise<Picked>) => {
    if (!groupId || adding) return;
    setProblem(null);
    const picked = await from().catch((): Picked => ({ kind: "none" }));
    if (picked.kind === "refused") {
      setProblem(th(picked.reason));
      return;
    }
    if (picked.kind !== "file") return;
    setAdding(true);
    try {
      await addGroupFile(groupId, lessonId, fileTitle(picked.file.name), picked.file);
      setReloads((n) => n + 1);
    } catch (error) {
      setProblem(errorText(te, error));
    } finally {
      setAdding(false);
    }
  };
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
      {groupId && engine.self.role === "HOST" ? (
        <View style={styles.addRow} testID="files-add">
          {/* No "Take a photo" here: the lesson holds the camera. */}
          <AddButton
            label={th("choosePhoto")}
            busy={adding}
            onPress={() => void add(choosePhoto)}
            testID="files-add-photo"
          >
            <ImageIcon size={16} color={room.ink} />
          </AddButton>
          <AddButton
            label={th("chooseFile")}
            busy={adding}
            onPress={() => void add(chooseFile)}
            testID="files-add-file"
          >
            <Paperclip size={16} color={room.ink} />
          </AddButton>
          {adding ? <ActivityIndicator color={room.ink} /> : null}
        </View>
      ) : null}
      {problem ? (
        <Text
          variant="small"
          style={styles.problem}
          accessibilityRole="alert"
          testID="files-problem"
        >
          {problem}
        </Text>
      ) : null}
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

/** A file's name without its ending, as the material's title. */
function fileTitle(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).slice(0, 200) || name;
}

function AddButton({
  label,
  busy,
  onPress,
  testID,
  children,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
  testID: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [styles.add, (pressed || busy) && styles.pressed]}
      testID={testID}
    >
      {children}
      <Text variant="smallStrong" style={styles.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  add: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: room.border,
  },
  problem: { color: room.warning },
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
