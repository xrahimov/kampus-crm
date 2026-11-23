import { useEvent, useEventListener } from "expo";
import { useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { ExternalLink } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";

import { saveMaterialProgress } from "@/api/portal";

import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { EmptyState, Loading } from "@/components/surface";
import { fileSource, opensWithoutSession, type FileSource } from "@/features/room/file-source";
import { useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import { openOnSite } from "@/lib/web";
import { materialView } from "@kampus/lib/video-material";

import { AudioClip } from "./audio-clip";
import { useLocalFile } from "./local-file";
import { PdfDocument } from "./pdf-document";

/** A lesson recording's extras: its streaming copy, and whose place in it to keep (A-213). */
export interface RecordingRoute {
  /**
   * The membership token and the material's id: where a student's place in the
   * recording is saved. A teacher's recording has neither; nothing is saved.
   */
  token?: string;
  material?: string;
  /** The streaming copy's address, when the server has made one. */
  stream?: string | null;
  /** Seconds to continue from. */
  resume?: number | null;
}

/** The address of the screen that shows `url`, for `router.push`. */
export function fileRoute(url: string, title: string, recording?: RecordingRoute) {
  if (!recording) return { pathname: "/file" as const, params: { url, title } };
  return {
    pathname: "/file" as const,
    params: {
      url,
      title,
      recording: "1",
      token: recording.token ?? "",
      material: recording.material ?? "",
      stream: recording.stream ?? "",
      resume: String(Math.floor(recording.resume ?? 0)),
    },
  };
}

/** How often a playing recording says where it is. */
const REPORT_EVERY_MS = 10_000;
/** A place this close to either end is not worth continuing from. */
const EDGE_SEC = 5;

/**
 * One file opened inside the app (A-212): a PDF to scroll through, a picture
 * to enlarge, a video or a recording to play. What the phone cannot draw
 * (Word, Excel, a zip) is handed to another app.
 */
export function FileScreen() {
  const {
    url = "",
    title,
    recording: isRecording,
    token,
    material,
    stream,
    resume,
  } = useLocalSearchParams<{
    url: string;
    title?: string;
    recording?: string;
    token?: string;
    material?: string;
    stream?: string;
    resume?: string;
  }>();
  const t = useTranslations("mobile.file");
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const source = fileSource(url);
  // A phone sends the session with its request; a browser fetches a staff file first.
  const file = useLocalFile(source, () => setFailed(true));
  const recording = token && material ? { token, material } : null;
  const view = failed ? "file" : materialView(isRecording ? "RECORDING" : "FILE", url);
  const name = title || t("title");

  const openOutside = () => {
    if (opensWithoutSession(url)) void Linking.openURL(source.uri).catch(() => undefined);
    else void openOnSite(url).catch(() => undefined);
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]} testID="file-screen">
      <Header back title={name} />
      {!file && view !== "file" ? (
        <Loading />
      ) : view === "pdf" ? (
        <PdfDocument source={file ?? source} onError={() => setFailed(true)} />
      ) : view === "image" ? (
        <ScrollView
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          contentContainerStyle={styles.grow}
          testID="file-image-space"
        >
          <Image
            source={file ?? source}
            accessibilityLabel={name}
            resizeMode="contain"
            onError={() => setFailed(true)}
            style={styles.fill}
            testID="file-image"
          />
        </ScrollView>
      ) : view === "video" ? (
        <Video
          // A phone plays the streaming copy (an iPhone cannot play the raw recording);
          // a browser plays the file itself.
          source={stream && Platform.OS !== "web" ? fileSource(stream) : (file ?? source)}
          resume={Number(resume) || 0}
          recording={recording}
          onError={() => setFailed(true)}
        />
      ) : view === "audio" ? (
        <View style={styles.center}>
          <AudioClip source={file ?? source} label={name} testID="file-audio" />
        </View>
      ) : (
        <View style={styles.center}>
          <EmptyState
            title={failed ? t("failed") : t("cannotShow")}
            action={
              <Button
                variant="outline"
                label={t("openOutside")}
                icon={<ExternalLink size={18} color={colors.foreground} />}
                onPress={openOutside}
                testID="file-open-outside"
              />
            }
          />
        </View>
      )}
    </View>
  );
}

/**
 * A video with the phone's own controls: this one is the viewer's to steer. A
 * lesson recording continues where the student stopped, and says where it is
 * every ten seconds, on pause and on leaving, as the site's player does.
 */
function Video({
  source,
  resume,
  recording,
  onError,
}: {
  source: FileSource;
  resume: number;
  recording: { token: string; material: string } | null;
  onError: () => void;
}) {
  const player = useVideoPlayer(
    source.headers ? { uri: source.uri, headers: source.headers } : source.uri,
    (p) => {
      p.timeUpdateEventInterval = 1;
    },
  );
  const status = useEvent(player, "statusChange", { status: player.status }).status;
  const resumed = useRef(false);
  const lastReport = useRef(0);
  const place = useRef({ position: 0, duration: 0 });

  const report = (force: boolean) => {
    if (!recording) return;
    const { position, duration } = place.current;
    const now = Date.now();
    if (!force && now - lastReport.current < REPORT_EVERY_MS) return;
    if (force && position <= 0) return;
    lastReport.current = now;
    void saveMaterialProgress(
      recording.token,
      recording.material,
      position,
      duration > 0 ? Math.round(duration) : null,
    ).catch(() => undefined);
  };
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  });

  useEffect(() => {
    if (status === "error") onError();
    if (status !== "readyToPlay" || resumed.current) return;
    resumed.current = true;
    const duration = player.duration;
    if (resume > EDGE_SEC && (!(duration > 0) || resume < duration - EDGE_SEC)) {
      moveTo(player, resume);
    }
  }, [status, player, resume, onError]);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    place.current = { position: currentTime, duration: player.duration };
    if (player.playing) reportRef.current(false);
  });
  useEventListener(player, "playingChange", ({ isPlaying }) => {
    if (!isPlaying) reportRef.current(true);
  });
  // Leaving the screen keeps the place too.
  useEffect(() => () => reportRef.current(true), []);

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      allowsVideoFrameAnalysis={false}
      style={styles.fill}
      testID="file-video"
    />
  );
}

/** Puts a player at a second of its file. */
function moveTo(player: VideoPlayer, seconds: number): void {
  player.currentTime = seconds;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", padding: space[4] },
});
