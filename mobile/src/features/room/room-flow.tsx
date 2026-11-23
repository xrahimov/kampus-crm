import { useRouter } from "expo-router";
import { ArrowLeft, Mic, MicOff, Video, VideoOff } from "lucide-react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/text";
import { API_ORIGIN } from "@/lib/api";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space } from "@/lib/theme";
import { CallEngine, openLocalMedia } from "@kampus/lib/video/call-engine";
import type { JoinDto, VideoPeerRole } from "@kampus/lib/video/dto";

import { CallScreen } from "./call-screen";
import { room } from "./look";
import { callAudio, CALLS_AVAILABLE, prepareCalls, StreamView } from "./platform";
import { initials } from "./tile";

type Outcome = "left" | "ended" | "gone" | "error";

const idle = { subscribe: () => () => undefined, getVersion: () => 0 };

/**
 * A lesson from the moment someone opens it to the moment they are out again
 * (A-207): the check of camera and microphone, the room, and the closing
 * screen. The same three steps as on the site, for a teacher and for a student.
 */
export function RoomFlow({
  role,
  name,
  title,
  ready,
  waitingText,
  join,
  endForAll,
}: {
  /** Who the person will be in the room; a student sends a smaller picture. */
  role: VideoPeerRole;
  name: string;
  /** The group's name, shown while checking the camera. */
  title: string;
  /** False while the teacher has not started the lesson (a student waits). */
  ready: boolean;
  waitingText?: string;
  join: () => Promise<JoinDto>;
  /** Present when this person may end the lesson for everyone. */
  endForAll?: (roomId: string) => Promise<void>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [engine, setEngine] = useState<CallEngine | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store = engine ?? idle;
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);

  // Leaving the screen any way at all (the back gesture, signing out) leaves the lesson.
  const current = useRef<CallEngine | null>(null);
  useEffect(() => {
    current.current = engine;
  }, [engine]);
  useEffect(
    () => () => {
      current.current?.leave();
      callAudio.stop();
    },
    [],
  );

  const start = async (stream: MediaStream) => {
    setBusy(true);
    setError(null);
    try {
      const self = await join();
      const next = new CallEngine(self, stream, { origin: API_ORIGIN });
      callAudio.start();
      next.start();
      setOutcome(null);
      setEngine(next);
    } catch (e) {
      for (const track of stream.getTracks()) track.stop();
      setError(errorText(t, e));
      // The check reopens the camera when it is shown again.
      setOutcome("error");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const engineDone =
    engine && ["ended", "gone", "error"].includes(engine.status)
      ? (engine.status as Outcome)
      : null;
  useEffect(() => {
    if (engineDone) callAudio.stop();
  }, [engineDone]);
  const finished = engineDone ?? outcome;

  if (engine && !finished) {
    return (
      <CallScreen
        engine={engine}
        onLeave={() => {
          engine.leave();
          callAudio.stop();
          setEngine(null);
          setOutcome("left");
        }}
        onEndForAll={
          endForAll && engine.self.canEnd
            ? async () => {
                await endForAll(engine.self.roomId);
                engine.leave();
                callAudio.stop();
                setEngine(null);
                setOutcome("ended");
              }
            : undefined
        }
      />
    );
  }

  if (finished && finished !== "error") {
    return (
      <Shell title={title} onBack={close}>
        <View style={styles.done} testID="call-done">
          <Text variant="title" style={styles.inkCenter}>
            {t(`video.done.${finished}`)}
          </Text>
          <View style={styles.doneActions}>
            {finished !== "ended" ? (
              <RoomAction
                label={t("video.done.rejoin")}
                onPress={() => {
                  setEngine(null);
                  setOutcome(null);
                }}
                testID="rejoin"
              />
            ) : null}
            <RoomAction label={t("common.back")} quiet onPress={close} testID="room-back" />
          </View>
        </View>
      </Shell>
    );
  }

  return (
    <Shell title={title} onBack={close}>
      <Lobby
        key={outcome ?? "first"}
        role={role}
        name={name}
        ready={ready}
        busy={busy}
        error={error ?? (engineDone === "error" ? t("video.done.error") : null)}
        waitingText={waitingText}
        onJoin={(stream) => void start(stream)}
      />
    </Shell>
  );
}

/** The dark page around the check and the closing screen, with a way back. */
function Shell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={styles.back}
          testID="room-close"
        >
          <ArrowLeft size={22} color={room.ink} />
        </Pressable>
        <Text variant="heading" style={styles.ink} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Before joining: see yourself, choose microphone and camera on or off, then go in. */
function Lobby({
  role,
  name,
  ready,
  busy,
  error,
  waitingText,
  onJoin,
}: {
  role: VideoPeerRole;
  name: string;
  ready: boolean;
  busy: boolean;
  error: string | null;
  waitingText?: string;
  onJoin: (stream: MediaStream) => void;
}) {
  const t = useTranslations();
  const { wide, width, height } = useLayout();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [denied, setDenied] = useState(false);
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  // Once the stream goes into the room it is the room's to stop.
  const handedOver = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let opened: MediaStream | null = null;
    if (!CALLS_AVAILABLE) return;
    prepareCalls();
    void openLocalMedia(role, { audio: true, video: true }).then((result) => {
      if (cancelled) {
        for (const track of result.stream.getTracks()) track.stop();
        return;
      }
      opened = result.stream;
      setStream(result.stream);
      setDenied(result.denied);
      setAudio(result.stream.getAudioTracks().length > 0);
      setVideo(result.stream.getVideoTracks().length > 0);
    });
    return () => {
      cancelled = true;
      if (opened && !handedOver.current) for (const track of opened.getTracks()) track.stop();
    };
  }, [role]);

  const hasAudio = Boolean(stream && stream.getAudioTracks().length > 0);
  const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0);
  const toggle = (kind: "audio" | "video") => {
    if (!stream) return;
    const next = kind === "audio" ? !audio : !video;
    for (const track of kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks()) {
      track.enabled = next;
    }
    if (kind === "audio") setAudio(next);
    else setVideo(next);
  };

  const sideBySide = wide && width > height;
  const nothing = stream !== null && !hasAudio && !hasVideo;

  if (!CALLS_AVAILABLE) {
    return (
      <View style={styles.done}>
        <Text style={styles.inkCenter}>{t("mobile.room.unavailable")}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.lobby, sideBySide && styles.lobbySide]} testID="room-lobby">
      <View style={[styles.preview, sideBySide && styles.previewSide]}>
        {stream && hasVideo && video ? (
          <StreamView stream={stream} mirror style={styles.fill} testID="lobby-picture" />
        ) : (
          <View style={styles.previewEmpty}>
            {stream ? (
              <View style={styles.initials}>
                <Text style={styles.initialsText}>{initials(name)}</Text>
              </View>
            ) : (
              <>
                <ActivityIndicator color={room.active} />
                <Text variant="small" style={styles.inkMuted}>
                  {t("video.lobby.opening")}
                </Text>
              </>
            )}
          </View>
        )}
        <View style={styles.previewControls}>
          <RoundToggle
            label={audio ? t("video.lobby.micOff") : t("video.lobby.micOn")}
            off={!audio || !hasAudio}
            disabled={!hasAudio}
            onPress={() => toggle("audio")}
            testID="lobby-mic"
          >
            {audio && hasAudio ? (
              <Mic size={22} color={room.ink} />
            ) : (
              <MicOff size={22} color={room.dangerInk} />
            )}
          </RoundToggle>
          <RoundToggle
            label={video ? t("video.lobby.cameraOff") : t("video.lobby.cameraOn")}
            off={!video || !hasVideo}
            disabled={!hasVideo}
            onPress={() => toggle("video")}
            testID="lobby-camera"
          >
            {video && hasVideo ? (
              <Video size={22} color={room.ink} />
            ) : (
              <VideoOff size={22} color={room.dangerInk} />
            )}
          </RoundToggle>
        </View>
      </View>

      <View style={[styles.lobbyText, sideBySide && styles.lobbyTextSide]}>
        <Text variant="title" style={styles.ink}>
          {t("video.lobby.check")}
        </Text>
        <Text style={styles.inkMuted}>{name}</Text>
        {denied ? (
          <View style={styles.note}>
            <Text variant="small" style={styles.ink}>
              {nothing ? t("mobile.room.denied") : t("mobile.room.partial")}
            </Text>
            {Platform.OS !== "web" ? (
              <RoomAction
                label={t("mobile.room.openSettings")}
                quiet
                onPress={() => void Linking.openSettings()}
                testID="open-settings"
              />
            ) : null}
          </View>
        ) : null}
        {error ? (
          <View style={[styles.note, styles.noteError]}>
            <Text variant="small" style={styles.ink}>
              {error}
            </Text>
          </View>
        ) : null}
        {!ready && waitingText ? (
          <View style={styles.note} testID="room-waiting">
            <Text variant="small" style={styles.ink}>
              {waitingText}
            </Text>
          </View>
        ) : null}
        <RoomAction
          label={busy ? t("video.lobby.joining") : t("video.lobby.join")}
          disabled={!ready || !stream || busy}
          busy={busy}
          onPress={() => {
            if (!stream) return;
            handedOver.current = true;
            onJoin(stream);
          }}
          testID="join-room"
        />
      </View>
    </View>
  );
}

function RoundToggle({
  label,
  children,
  onPress,
  off,
  disabled,
  testID,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  off: boolean;
  disabled: boolean;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: !off }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.round,
        off && styles.roundOff,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

function RoomAction({
  label,
  onPress,
  quiet = false,
  busy = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  /** A second choice: outlined instead of filled. */
  quiet?: boolean;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        quiet ? styles.actionQuiet : styles.actionMain,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={room.activeInk} /> : null}
      <Text variant="bodyStrong" style={quiet ? styles.ink : styles.activeInk}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: room.background },
  fill: { flex: 1 },
  ink: { color: room.ink },
  inkMuted: { color: room.inkMuted },
  inkCenter: { color: room.ink, textAlign: "center" },
  activeInk: { color: room.activeInk },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surface,
  },
  lobby: { flex: 1, padding: space[4], gap: space[5] },
  lobbySide: { flexDirection: "row", alignItems: "center", padding: space[8], gap: space[8] },
  preview: {
    flex: 1,
    minHeight: 220,
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: room.surface,
    borderWidth: 1,
    borderColor: room.border,
  },
  previewSide: { flex: 3, alignSelf: "stretch" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[2] },
  previewControls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: space[4],
    flexDirection: "row",
    justifyContent: "center",
    gap: space[4],
  },
  initials: {
    width: 112,
    height: 112,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surfaceRaised,
  },
  initialsText: { fontSize: 40, lineHeight: 48, color: room.ink },
  round: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surfaceRaised,
  },
  roundOff: { backgroundColor: room.danger },
  lobbyText: { gap: space[3] },
  lobbyTextSide: { flex: 2 },
  note: {
    gap: space[2],
    padding: space[3],
    borderRadius: radius.md,
    backgroundColor: room.surface,
  },
  noteError: { borderWidth: 1, borderColor: room.danger },
  action: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    paddingHorizontal: space[5],
    borderRadius: radius.md,
  },
  actionMain: { backgroundColor: room.active },
  actionQuiet: { borderWidth: 1, borderColor: room.border },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  done: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space[5],
    padding: space[6],
  },
  doneActions: { alignSelf: "stretch", maxWidth: 420, width: "100%", gap: space[3] },
});
