import { useEvent } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoSource } from "expo-video";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  Music,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { font, radius, space } from "@/lib/theme";
import { openOnSite } from "@/lib/web";
import {
  annotationLayer,
  canAnnotate,
  expectedPosition,
  needsSeek,
  youtubeId,
} from "@kampus/lib/video-material";
import type { CallEngine } from "@kampus/lib/video/call-engine";
import type { ShownMaterialDto } from "@kampus/lib/video/dto";

import { BoardSurface, BoardToolbar, useBoardTools } from "./board";
import { fitBox } from "./board-shapes";
import { clock, fileSource, opensWithoutSession, type FileSource } from "./file-source";
import { room } from "./look";
import { PdfPage } from "./pdf-page";
import { YouTubePlayer } from "./youtube";

/** Each viewer enlarges a page for themselves: fit, then these, then back to fit. */
const ZOOM_STEPS = [1, 1.75, 2.5];
/** How often a follower checks that its player is still in step with the teacher's. */
const FOLLOW_CHECK_MS = 4000;
const JUMP_SECONDS = 10;

/**
 * A lesson material on everyone's stage, in the app (A-210). The teacher turns
 * the pages of a PDF and plays, pauses and jumps in a video or audio file;
 * everyone follows. A picture or a page can be drawn on with the whiteboard's
 * pen. What the phone cannot draw (other links, office files) is a card with a
 * button. The same rules as the site's stage, from the same shared code.
 */
export function MaterialStage({
  engine,
  material,
}: {
  engine: CallEngine;
  material: ShownMaterialDto;
}) {
  const t = useTranslations("video.material");
  const tm = useTranslations("mobile.room.material");
  const isHost = engine.self.role === "HOST";
  const [pages, setPages] = useState<number | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  // A file that could not be drawn here is offered to open by itself; remembered per file.
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = failedId === material.id;
  const [tools, setTools] = useBoardTools();
  const [zoomStep, setZoomStep] = useState(0);
  const zoom = ZOOM_STEPS[zoomStep] ?? 1;
  const lastZoom = zoomStep >= ZOOM_STEPS.length - 1;
  const view = failed ? "file" : material.view;
  const drawable = canAnnotate(view);
  const drawing = drawable && engine.currentStage.board;
  const layer = annotationLayer(material.id, material.page);
  const source = fileSource(material.url);

  const open = () => {
    // A student's link and an outside address open by themselves; a staff file sits
    // behind the session, so the site is opened signed in (A-204).
    if (opensWithoutSession(material.url)) void Linking.openURL(source.uri).catch(() => undefined);
    else void openOnSite(material.url).catch(() => undefined);
  };

  return (
    <View style={styles.stage} testID="material-stage">
      <View style={styles.bar}>
        <Text variant="smallStrong" style={styles.title} numberOfLines={1} testID="material-title">
          {material.title}
        </Text>
        {view === "pdf" ? (
          <View style={styles.pager}>
            {isHost ? (
              <BarButton
                label={t("prevPage")}
                disabled={material.page <= 1}
                onPress={() => engine.turnMaterialPage(material.page - 1)}
                testID="material-prev"
              >
                <ChevronLeft size={20} color={room.ink} />
              </BarButton>
            ) : null}
            <Text variant="small" style={styles.page} testID="material-page">
              {pages
                ? t("pageOf", { page: Math.min(material.page, pages), pages })
                : t("page", { page: material.page })}
            </Text>
            {isHost ? (
              <BarButton
                label={t("nextPage")}
                disabled={pages === null || material.page >= pages}
                onPress={() => engine.turnMaterialPage(material.page + 1)}
                testID="material-next"
              >
                <ChevronRight size={20} color={room.ink} />
              </BarButton>
            ) : null}
          </View>
        ) : null}
        {isHost && drawable ? (
          <BarButton
            label={drawing ? t("penOff") : t("pen")}
            on={drawing}
            onPress={() => engine.setStage({ board: !drawing })}
            testID="material-pen"
          >
            <PenLine size={18} color={drawing ? room.activeInk : room.ink} />
          </BarButton>
        ) : null}
        {drawable ? (
          <BarButton
            label={lastZoom ? t("zoomFit") : t("zoomIn")}
            onPress={() => setZoomStep(lastZoom ? 0 : zoomStep + 1)}
            testID="material-zoom"
          >
            {lastZoom ? (
              <ZoomOut size={18} color={room.ink} />
            ) : (
              <ZoomIn size={18} color={room.ink} />
            )}
          </BarButton>
        ) : null}
        <BarButton label={tm("open")} onPress={open} testID="material-open">
          <ExternalLink size={18} color={room.ink} />
        </BarButton>
        {isHost ? (
          <BarButton label={t("stop")} onPress={() => engine.hideMaterial()} testID="material-stop">
            <X size={18} color={room.ink} />
          </BarButton>
        ) : null}
      </View>

      {/* Over a page the pens are for those who draw; the others just see the marks. */}
      {drawing && engine.canDraw ? (
        <BoardToolbar engine={engine} layer={layer} tools={tools} onTools={setTools} dark />
      ) : null}

      {view === "pdf" || view === "image" ? (
        <PageBox aspect={aspect} zoom={zoom}>
          {view === "pdf" ? (
            <PdfPage
              source={source}
              page={material.page}
              onInfo={(info) => {
                setPages(info.pages);
                setAspect(info.aspect);
              }}
              onError={() => setFailedId(material.id)}
            />
          ) : (
            <Picture
              // A new file is a new picture.
              key={material.id}
              source={source}
              title={material.title}
              onAspect={setAspect}
              onError={() => setFailedId(material.id)}
            />
          )}
          {drawing ? (
            <BoardSurface
              engine={engine}
              layer={layer}
              tools={tools}
              aspect={aspect}
              transparent
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </PageBox>
      ) : view === "video" || view === "audio" ? (
        <MediaView
          // A new file is a new player.
          key={material.id}
          engine={engine}
          material={material}
          source={source}
          audio={view === "audio"}
          onError={() => setFailedId(material.id)}
        />
      ) : view === "youtube" ? (
        <View style={styles.youtube}>
          <YouTubePlayer id={youtubeId(material.url) ?? ""} title={material.title} />
          <Text variant="small" style={styles.hint}>
            {t("youtubeHint")}
          </Text>
        </View>
      ) : (
        <View style={styles.cardSpace}>
          <View style={styles.card} testID="material-card">
            <View style={styles.cardIcon}>
              {material.kind === "LINK" ? (
                <Link2 size={24} color={room.ink} />
              ) : (
                <FileText size={24} color={room.ink} />
              )}
            </View>
            <Text variant="bodyStrong" style={styles.cardTitle}>
              {material.title}
            </Text>
            <Text variant="small" style={styles.hint}>
              {failed ? tm("failed") : material.kind === "LINK" ? tm("linkText") : tm("fileText")}
            </Text>
            {isHost && !failed && material.kind !== "LINK" ? (
              <Text variant="small" style={styles.hint}>
                {t("fileHostHint")}
              </Text>
            ) : null}
            <Pressable
              onPress={open}
              accessibilityRole="button"
              style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}
              testID="material-card-open"
            >
              <ExternalLink size={16} color="#17234b" />
              <Text variant="smallStrong" style={styles.cardButtonText}>
                {tm("open")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Holds one page at its own shape, as large as the space allows, or larger
 * when the viewer zoomed in (then the space scrolls both ways). The pen's
 * marks are kept in 0-1 coordinates of this box, so they land on the same spot
 * of the page on a phone and on a large screen.
 */
function PageBox({
  aspect,
  zoom,
  children,
}: {
  aspect: number;
  zoom: number;
  children: ReactNode;
}) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((cur) => (cur.width === width && cur.height === height ? cur : { width, height }));
  };
  const fit = fitBox(area, aspect);
  const box = { width: Math.round(fit.width * zoom), height: Math.round(fit.height * zoom) };
  return (
    <View style={styles.pageSpace} onLayout={measure} testID="material-page-space">
      {/* Always the same tree, zoomed or not, so the page is not opened again by a zoom. */}
      <ScrollView
        scrollEnabled={zoom > 1}
        contentContainerStyle={styles.pageScroll}
        showsVerticalScrollIndicator={zoom > 1}
      >
        <ScrollView
          horizontal
          scrollEnabled={zoom > 1}
          contentContainerStyle={styles.pageScroll}
          showsHorizontalScrollIndicator={zoom > 1}
        >
          {box.width > 0 ? (
            <View style={[styles.pageBox, box]} testID="material-page-box">
              {children}
            </View>
          ) : null}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

/**
 * A video or audio file played in step (A-183, A-210). The teacher has the
 * buttons: play, pause, ten seconds back and forward, and a bar to jump on;
 * each goes to everyone. Followers have none: their player goes where the
 * teacher's is.
 */
function MediaView(props: {
  engine: CallEngine;
  material: ShownMaterialDto;
  source: FileSource;
  audio: boolean;
  onError: () => void;
}) {
  // The player is made once the file can be asked for: a player whose file is swapped
  // under it starts playing by itself in a browser.
  const file = useLocalFile(props.source, props.onError);
  if (!file) return <View style={styles.media} testID="material-media-loading" />;
  return <MediaPlayer {...props} file={file} />;
}

function MediaPlayer({
  engine,
  material,
  file,
  audio,
  onError,
}: {
  engine: CallEngine;
  material: ShownMaterialDto;
  file: FileSource;
  audio: boolean;
  onError: () => void;
}) {
  const t = useTranslations("video.material");
  const tm = useTranslations("mobile.room.material");
  const isHost = engine.self.role === "HOST";
  const { playing, position, at } = material;
  const media: VideoSource = file.headers ? { uri: file.uri, headers: file.headers } : file.uri;
  const player = useVideoPlayer(media, (p) => {
    // The lesson's voices go on while the file plays.
    p.audioMixingMode = "mixWithOthers";
    p.timeUpdateEventInterval = 0.5;
  });
  const status = useEvent(player, "statusChange", { status: player.status });
  const isPlaying = useEvent(player, "playingChange", { isPlaying: player.playing }).isPlaying;
  const time = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  }).currentTime;
  const ready = status.status === "readyToPlay";
  const duration = ready && player.duration > 0 ? player.duration : 0;
  // A browser may refuse to start sound by itself: the viewer taps once.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (status.status === "error") onError();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reported once per failure
  }, [status.status]);

  // Every follower's player, and the teacher's when it opens: go where the lesson is.
  const caughtUp = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const follow = () => {
      const expected = expectedPosition({ playing, position, at }, engine.serverNow());
      const target = player.duration > 0 ? Math.min(expected, player.duration) : expected;
      if (needsSeek(player.currentTime, target)) moveTo(player, target);
      if (playing && !player.playing) {
        player.play();
        // Asked to play and still not playing a moment later: the browser wants a tap.
        setTimeout(() => setBlocked(!player.playing), 1200);
      } else if (!playing && player.playing) {
        player.pause();
      }
    };
    if (isHost) {
      // The teacher's player leads; it only catches up once, when it opens.
      if (caughtUp.current) return;
      caughtUp.current = true;
      follow();
      return;
    }
    follow();
    const timer = setInterval(follow, FOLLOW_CHECK_MS);
    return () => clearInterval(timer);
  }, [engine, player, isHost, ready, playing, position, at]);

  const lead = (nextPlaying: boolean, nextTime: number) => {
    const clamped = Math.max(0, duration > 0 ? Math.min(nextTime, duration) : nextTime);
    if (clamped !== player.currentTime) moveTo(player, clamped);
    if (nextPlaying) player.play();
    else player.pause();
    engine.setMaterialPlayback(nextPlaying, clamped);
  };

  const [barWidth, setBarWidth] = useState(0);
  const jumpTo = (event: GestureResponderEvent) => {
    if (barWidth <= 0 || duration <= 0) return;
    const share = Math.min(1, Math.max(0, event.nativeEvent.locationX / barWidth));
    lead(isPlaying, share * duration);
  };

  return (
    <View style={styles.media} testID="material-media">
      {audio ? (
        <View style={styles.audioIcon}>
          <Music size={32} color={room.ink} />
        </View>
      ) : null}
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={audio ? styles.hidden : styles.video}
      />
      {isHost ? (
        <View style={styles.transport} testID="material-transport">
          <View style={styles.transportRow}>
            <BarButton
              label={tm("back10")}
              disabled={!ready}
              onPress={() => lead(isPlaying, player.currentTime - JUMP_SECONDS)}
              testID="material-back"
            >
              <RotateCcw size={18} color={room.ink} />
            </BarButton>
            <Pressable
              onPress={() => lead(!isPlaying, player.currentTime)}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? tm("pause") : tm("play")}
              style={({ pressed }) => [
                styles.playButton,
                pressed && styles.pressed,
                !ready && styles.dim,
              ]}
              testID="material-play"
            >
              {isPlaying ? (
                <Pause size={22} color={room.activeInk} />
              ) : (
                <Play size={22} color={room.activeInk} />
              )}
            </Pressable>
            <BarButton
              label={tm("forward10")}
              disabled={!ready}
              onPress={() => lead(isPlaying, player.currentTime + JUMP_SECONDS)}
              testID="material-forward"
            >
              <RotateCw size={18} color={room.ink} />
            </BarButton>
            <Text variant="small" style={styles.time} testID="material-time">
              {clock(time)} / {clock(duration)}
            </Text>
          </View>
          <Pressable
            onPress={jumpTo}
            onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
            accessibilityRole="adjustable"
            accessibilityLabel={tm("jump")}
            style={styles.seek}
            testID="material-seek"
          >
            <View style={styles.seekTrack}>
              <View
                style={[
                  styles.seekDone,
                  { width: `${duration > 0 ? Math.min(100, (time / duration) * 100) : 0}%` },
                ]}
              />
            </View>
          </Pressable>
        </View>
      ) : null}
      <Text variant="small" style={styles.hint} testID="material-media-status">
        {isHost ? tm("hostPlayHint") : playing ? t("followPlaying") : t("followPaused")}
      </Text>
      {blocked && !isHost && playing ? (
        <Pressable
          onPress={() => {
            player.play();
            setBlocked(false);
          }}
          accessibilityRole="button"
          style={styles.tapToPlay}
          testID="material-tap-to-play"
        >
          <Play size={16} color="#17234b" />
          <Text variant="smallStrong" style={styles.cardButtonText}>
            {t("tapToPlay")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Puts a player at a second of its file. */
function moveTo(player: VideoPlayer, seconds: number): void {
  player.currentTime = seconds;
}

/**
 * The file as this device can ask for it. A phone's picture and player send
 * the session with their request; a browser's cannot, so the web build fetches
 * a staff file itself and draws it from memory (null until it is there). A
 * student's link needs neither.
 */
function useLocalFile(source: FileSource, onError: () => void): FileSource | null {
  const viaFetch = Platform.OS === "web" && Boolean(source.headers);
  const [local, setLocal] = useState<{ from: string; uri: string } | null>(null);
  useEffect(() => {
    if (!viaFetch) return;
    let alive = true;
    let made: string | null = null;
    fetch(source.uri, { headers: source.headers, credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setLocal({ from: source.uri, uri: made });
      })
      .catch(() => {
        if (alive) onError();
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one fetch per file
  }, [viaFetch, source.uri]);
  if (!viaFetch) return source;
  return local && local.from === source.uri ? { uri: local.uri } : null;
}

/** A picture on the stage; it reports its own shape once it is there. */
function Picture({
  source,
  title,
  onAspect,
  onError,
}: {
  source: FileSource;
  title: string;
  onAspect: (aspect: number) => void;
  onError: () => void;
}) {
  const file = useLocalFile(source, onError);
  if (!file) return null;
  return (
    <Image
      source={file}
      accessibilityLabel={title}
      resizeMode="contain"
      onLoad={(event) => {
        const { width, height } = event.nativeEvent.source ?? {};
        if (width > 0 && height > 0) onAspect(width / height);
      }}
      onError={onError}
      style={styles.fill}
      testID="material-image"
    />
  );
}

/** A square button of the stage's dark bar. */
function BarButton({
  label,
  onPress,
  children,
  on = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  on?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: on }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.barButton,
        on && styles.barButtonOn,
        pressed && styles.pressed,
        disabled && styles.dim,
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stage: { flex: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: room.surface },
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 96,
    color: room.ink,
    paddingHorizontal: space[1],
  },
  pager: { flexDirection: "row", alignItems: "center" },
  page: { color: room.ink, paddingHorizontal: space[1], fontVariant: ["tabular-nums"] },
  barButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  barButtonOn: { backgroundColor: room.active },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.35 },
  pageSpace: { flex: 1, margin: space[2], marginTop: 0 },
  pageScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  pageBox: { overflow: "hidden", borderRadius: radius.sm, backgroundColor: "#ffffff" },
  youtube: { flex: 1, gap: space[2], padding: space[2], paddingTop: 0 },
  hint: { color: room.inkMuted, textAlign: "center" },
  cardSpace: { flex: 1, alignItems: "center", justifyContent: "center", padding: space[4] },
  card: { maxWidth: 420, alignItems: "center", gap: space[3] },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surfaceRaised,
  },
  cardTitle: { color: room.ink, textAlign: "center" },
  cardButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    height: 44,
    paddingHorizontal: space[5],
    borderRadius: radius.full,
    backgroundColor: "#ffffff",
  },
  cardButtonText: { color: "#17234b" },
  media: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    padding: space[2],
    paddingTop: 0,
  },
  video: { flex: 1, alignSelf: "stretch", borderRadius: radius.sm, backgroundColor: "#000000" },
  hidden: { width: 1, height: 1, opacity: 0 },
  audioIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surfaceRaised,
  },
  transport: { alignSelf: "stretch", gap: space[1] },
  transportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.active,
  },
  time: { color: room.ink, fontFamily: font.medium, fontVariant: ["tabular-nums"], minWidth: 92 },
  seek: { height: 28, justifyContent: "center", alignSelf: "stretch" },
  seekTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: room.surfaceRaised,
  },
  seekDone: { height: 6, backgroundColor: room.active },
  tapToPlay: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    height: 48,
    paddingHorizontal: space[6],
    borderRadius: radius.full,
    backgroundColor: "#ffffff",
  },
});
