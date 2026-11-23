import {
  ChartColumn,
  DoorOpen,
  FileText,
  Focus,
  Hand,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Presentation,
  Smile,
  Star,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react-native";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/glass";
import { Animated, Press } from "@/components/motion";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { font, radius, space } from "@/lib/theme";
import { PACE_REACTIONS, REACTIONS } from "@kampus/lib/validation/video";
import { CHAT_MAX_LENGTH, type CallEngine, type RemotePeer } from "@kampus/lib/video/call-engine";
import {
  BOARD,
  breakoutCountdown,
  MATERIAL,
  REACTION_EMOJI,
  roomView,
  SELF,
} from "@kampus/lib/video/room-view";

import { WhiteboardStage } from "./board";
import { BreakoutPanel, useNow } from "./breakout-panel";
import { FilesPanel } from "./files-panel";
import { controlBar, gridColumns, room } from "./look";
import { MaterialStage } from "./material-stage";
import { RemoteAudio, screenShare } from "./platform";
import { PollCard, PollPanel } from "./poll-panel";
import { Tile } from "./tile";

type Panel = "people" | "chat" | "tools" | "files" | "poll" | "breakout" | "leave" | null;
/** Panels that hold a list: as a sheet they open tall, so more than two rows show. */
const LIST_PANELS: Panel[] = ["people", "chat", "files", "poll", "breakout"];
/** The panels that open from the teacher's Lesson tools. */
const TOOL_PANELS: Panel[] = ["tools", "files", "poll", "breakout"];

const GAP = space[2];
const NOTICE_MS = 6000;
/** How long after it appears a sheet starts to take presses. */
const SHEET_ARM_MS = 350;

/** The size of the bar's round buttons, set once for the whole bar. */
const ControlSize = createContext(46);

/**
 * The lesson room (A-207): a stage for whoever leads (a shared screen, the
 * person the teacher shows, the teacher for a student) with everyone else in a
 * strip, or a wall of equal tiles when nobody leads. The same rules as the
 * site's room, from the same code; only the drawing is the app's own.
 */
export function CallScreen({
  engine,
  groupId,
  onLeave,
  onEndForAll,
}: {
  engine: CallEngine;
  /** A teacher's group: lets them add a file to the lesson from this device. */
  groupId?: string;
  onLeave: () => void;
  /** Present when this person may end the lesson for everyone. */
  onEndForAll?: () => Promise<void>;
}) {
  const t = useTranslations("video.room");
  const tm = useTranslations("mobile.room");
  const insets = useSafeAreaInsets();
  const { wide, width, height } = useLayout();
  useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);

  const [pinned, setPinned] = useState<string | null>(null);
  const [sharerSeen, setSharerSeen] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardUp(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [mutedShownFor, setMutedShownFor] = useState<number | null>(null);
  const [loweredShownFor, setLoweredShownFor] = useState<number | null>(null);

  const self = engine.self;
  const media = engine.media;
  const peers = engine.peers();
  const stage = engine.currentStage;
  const breakout = engine.breakout;
  const isHost = self.role === "HOST";
  const isStudent = self.role === "STUDENT";
  const reactions = engine.activeReactions();
  const pace = isStudent ? null : engine.paceTally();

  const view = roomView({
    self,
    peers,
    media,
    stage,
    pinned,
    handRaisedAt: engine.handRaisedAt,
  });
  const { sharer, spotlightId, hidden, stageKey, handQueue } = view;
  if (sharer !== sharerSeen) {
    // A screen share that starts wins over the person this viewer chose earlier.
    setSharerSeen(sharer);
    if (sharer && pinned && pinned !== sharer) setPinned(null);
  }
  const handPlace = (id: string) => handQueue.findIndex((h) => h.id === id) + 1;

  // Chat lines count as read while the chat is open.
  useEffect(() => {
    if (panel === "chat") engine.markChatRead();
  }, [engine, panel, engine.unread]);

  const mutedBy = engine.mutedBy;
  const mutedNotice = mutedBy && mutedShownFor !== mutedBy.at ? mutedBy.name : null;
  useEffect(() => {
    if (!mutedBy) return;
    const timer = setTimeout(() => setMutedShownFor(mutedBy.at), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [mutedBy]);
  const loweredBy = engine.loweredBy;
  const loweredNotice = loweredBy && loweredShownFor !== loweredBy.at ? loweredBy.name : null;
  useEffect(() => {
    if (!loweredBy) return;
    const timer = setTimeout(() => setLoweredShownFor(loweredBy.at), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [loweredBy]);

  // "Everyone sees your screen now" shows for a few seconds after a share starts.
  const sharing = media.screen;
  const [shareSeen, setShareSeen] = useState(false);
  if (!sharing && shareSeen) setShareSeen(false);
  useEffect(() => {
    if (!sharing) return;
    const timer = setTimeout(() => setShareSeen(true), NOTICE_MS * 2);
    return () => clearTimeout(timer);
  }, [sharing]);
  const shareError = engine.shareError;
  // Microphone, camera, reactions, chat, people and leave, plus what this person may also do.
  // The seventh is the hand for a student and the tools for the teacher.
  const bar = controlBar(
    6 + (screenShare.available ? 1 : 0) + (isHost || isStudent ? 1 : 0),
    width,
  );

  const hasAudio = engine.localStream.getAudioTracks().length > 0;
  const hasCamera = engine.localStream.getVideoTracks().length > 0;

  const statusText = (p: RemotePeer): string | null =>
    p.connection === "connected"
      ? null
      : p.connection === "failed"
        ? tm("peerFailed")
        : t("connecting");
  const reactionOf = (from: string | null) => {
    const r = reactions.get(from);
    return r ? { key: r.seq, emoji: REACTION_EMOJI[r.reaction] } : undefined;
  };

  const tile = (id: string, big: boolean, size?: { width: number; height: number }) => {
    const press = () => setPinned((cur) => (cur === id ? null : id));
    const style = big ? styles.fill : size;
    if (id === SELF) {
      return (
        <Tile
          key={SELF}
          testID="tile-self"
          stream={engine.localStream}
          name={self.displayName}
          isSelf
          audioOn={media.audio}
          videoOn={media.video || media.screen}
          screen={media.screen}
          hand={media.hand}
          handPlace={media.hand ? handPlace(SELF) : undefined}
          reaction={reactionOf(null)}
          spotlight={spotlightId === SELF}
          big={big}
          onPress={press}
          style={style}
        />
      );
    }
    const p = peers.find((x) => x.id === id);
    if (!p) return null;
    return (
      <Tile
        key={p.id}
        testID={`tile-${p.id}`}
        stream={p.stream}
        name={p.displayName}
        audioOn={Boolean(p.media?.audio)}
        videoOn={Boolean(p.media?.video || p.media?.screen)}
        screen={Boolean(p.media?.screen)}
        hand={Boolean(p.media?.hand)}
        handPlace={p.media?.hand ? handPlace(p.id) : undefined}
        reaction={reactionOf(p.id)}
        spotlight={spotlightId === p.id}
        status={statusText(p)}
        big={big}
        onPress={press}
        style={style}
      />
    );
  };

  const everyone = [SELF, ...peers.filter((p) => !hidden.has(p.id)).map((p) => p.id)];
  // The whiteboard takes the stage like a person does, with everyone in the strip.
  const stageBoard = stageKey === BOARD;
  // So does a file the teacher shows (with the pen over it when the whiteboard is on too).
  const stageMaterial = stageKey === MATERIAL ? stage.material : null;
  const stageTile = stageKey && !stageMaterial && !stageBoard ? stageKey : null;
  const hasStage = stageBoard || stageMaterial !== null || stageTile !== null;
  const others = everyone.filter((id) => id !== stageTile);
  const sideBySide = wide && width > height;

  // A sheet comes up under the finger that opened it, and its lowest button ("End for
  // everyone" among them) lies where that finger still is. The press that opened it must
  // not reach it, so a sheet takes presses only a moment after it appears.
  const [armedPanel, setArmedPanel] = useState<Panel>(null);
  useEffect(() => {
    const timer = setTimeout(() => setArmedPanel(panel), SHEET_ARM_MS);
    return () => clearTimeout(timer);
  }, [panel]);
  const sheetArmed = armedPanel === panel;
  // Lit while one of the teacher's tools is open or running.
  const toolsOn =
    TOOL_PANELS.includes(panel) ||
    stage.board ||
    stage.material !== null ||
    breakout.rooms > 0 ||
    Boolean(engine.poll?.open);
  // The rooms' time left, in the line that says where this person is.
  const now = useNow(breakout.rooms > 0 && breakout.endsAt !== null);
  const roomsLeft = breakout.rooms > 0 ? breakoutCountdown(breakout.endsAt, now) : null;

  const leave = () => {
    if (onEndForAll) setPanel("leave");
    else onLeave();
  };
  const endForAll = async () => {
    if (!onEndForAll) return;
    setEnding(true);
    try {
      await onEndForAll();
    } finally {
      setEnding(false);
    }
  };

  const panelBody =
    panel === "people" ? (
      <PeoplePanel
        engine={engine}
        peers={peers}
        handQueue={handQueue}
        spotlightId={spotlightId}
        onClose={() => setPanel(null)}
      />
    ) : panel === "chat" ? (
      <ChatPanel engine={engine} onClose={() => setPanel(null)} />
    ) : panel === "tools" ? (
      <PanelFrame title={tm("tools")} onClose={() => setPanel(null)}>
        <View style={styles.leaveBody}>
          <RoomButton
            label={stage.board ? t("boardOff") : t("boardOn")}
            icon={<Presentation size={18} color={room.ink} />}
            onPress={() => {
              engine.setStage({ board: !stage.board });
              setPanel(null);
            }}
            testID="tool-board"
          />
          <RoomButton
            label={tm("files.title")}
            icon={<FileText size={18} color={room.ink} />}
            onPress={() => setPanel("files")}
            testID="tool-files"
          />
          <RoomButton
            label={t("poll")}
            icon={<ChartColumn size={18} color={room.ink} />}
            onPress={() => setPanel("poll")}
            testID="tool-poll"
          />
          <RoomButton
            label={tm("breakout")}
            icon={<DoorOpen size={18} color={room.ink} />}
            onPress={() => setPanel("breakout")}
            testID="tool-breakout"
          />
        </View>
      </PanelFrame>
    ) : panel === "files" ? (
      <PanelFrame title={tm("files.title")} onClose={() => setPanel(null)}>
        <FilesPanel engine={engine} groupId={groupId} onShown={() => setPanel(null)} />
      </PanelFrame>
    ) : panel === "poll" ? (
      <PanelFrame title={t("poll")} onClose={() => setPanel(null)}>
        <PollPanel engine={engine} />
      </PanelFrame>
    ) : panel === "breakout" ? (
      <PanelFrame title={tm("breakout")} onClose={() => setPanel(null)}>
        <BreakoutPanel engine={engine} />
      </PanelFrame>
    ) : panel === "leave" ? (
      <PanelFrame title={t("endTitle")} onClose={() => setPanel(null)}>
        <View style={styles.leaveBody}>
          <Text style={styles.ink}>{t("endText")}</Text>
          <RoomButton label={t("leave")} onPress={onLeave} testID="leave-only" />
          <RoomButton
            label={t("endForAll")}
            tone="danger"
            onPress={() => void endForAll()}
            busy={ending}
            testID="end-for-all"
          />
        </View>
      </PanelFrame>
    ) : null;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]} testID="call-room">
      {/* On the web build sound needs an element; a phone plays it by itself. */}
      {peers.map((p) => (
        <RemoteAudio key={p.id} stream={p.stream} />
      ))}

      <View style={styles.bar}>
        <View style={styles.fill}>
          <Text variant="bodyStrong" style={styles.ink} numberOfLines={1}>
            {self.groupName}
          </Text>
          <Text variant="small" style={styles.inkMuted} numberOfLines={1}>
            {t("inCall", { count: peers.length + 1 })}
          </Text>
        </View>
        {pace && (pace.slower > 0 || pace.faster > 0) ? (
          <View style={styles.pace} accessibilityLabel={t("paceTitle")}>
            {pace.slower > 0 ? (
              <Text variant="smallStrong" style={styles.ink}>
                {REACTION_EMOJI.slower} {pace.slower}
              </Text>
            ) : null}
            {pace.faster > 0 ? (
              <Text variant="smallStrong" style={styles.ink}>
                {REACTION_EMOJI.faster} {pace.faster}
              </Text>
            ) : null}
          </View>
        ) : null}
        {engine.canSwitchCamera ? (
          <IconButton
            label={t("switchCamera")}
            onPress={() => void engine.switchCamera()}
            testID="switch-camera"
          >
            <SwitchCamera size={20} color={room.ink} />
          </IconButton>
        ) : null}
      </View>

      <View style={styles.notices}>
        {engine.notice ? (
          <Banner onClose={() => engine.dismissNotice()} testID="host-notice">
            <Text variant="smallStrong" style={styles.ink}>
              {t("noticeFrom", { name: engine.notice.name })}
            </Text>{" "}
            {engine.notice.text}
          </Banner>
        ) : null}
        {mutedNotice ? <Banner>{t("mutedBy", { name: mutedNotice })}</Banner> : null}
        {loweredNotice ? <Banner>{t("loweredBy", { name: loweredNotice })}</Banner> : null}
        {stage.focus ? <Banner>{isStudent ? t("focusStudent") : t("focusTeacher")}</Banner> : null}
        {breakout.rooms > 0 ? (
          <Banner>
            {breakout.mine === null
              ? t("breakoutMain", { rooms: breakout.rooms })
              : isHost
                ? tm("breakoutVisiting", { number: breakout.mine })
                : t("breakoutIn", { number: breakout.mine })}
            {roomsLeft ? ` ${roomsLeft}` : ""}
          </Banner>
        ) : null}
        {sharing && !shareSeen ? (
          <Banner onClose={() => setShareSeen(true)} testID="share-started">
            {tm("shareStarted")}
          </Banner>
        ) : null}
        {shareError ? (
          <Banner onClose={() => engine.dismissShareError()} testID="share-failed">
            {shareError.reason === "blocked" ? tm("shareBlocked") : tm("shareFailed")}
          </Banner>
        ) : null}
        {engine.noShow && isHost ? <Banner>{t("noShow")}</Banner> : null}
        {isStudent ? <PollCard engine={engine} /> : null}
      </View>

      <View style={[styles.body, sideBySide && styles.row]}>
        <View style={[styles.fill, sideBySide && hasStage ? styles.row : null]}>
          {hasStage ? (
            <>
              <View style={styles.fill}>
                {stageMaterial ? (
                  <MaterialStage engine={engine} material={stageMaterial} />
                ) : stageBoard ? (
                  <WhiteboardStage engine={engine} />
                ) : stageTile ? (
                  tile(stageTile, true)
                ) : null}
              </View>
              {others.length > 0 ? (
                <ScrollView
                  horizontal={!sideBySide}
                  style={sideBySide ? styles.stripSide : styles.strip}
                  contentContainerStyle={styles.stripContent}
                  showsHorizontalScrollIndicator={false}
                >
                  {others.map((id) =>
                    tile(id, false, sideBySide ? { width: 204, height: 132 } : STRIP_TILE),
                  )}
                </ScrollView>
              ) : null}
            </>
          ) : (
            <Wall ids={everyone} render={(id, size) => tile(id, false, size)} />
          )}
        </View>
        {panelBody && sideBySide ? <SidePanel>{panelBody}</SidePanel> : null}
      </View>

      {reactionsOpen ? (
        <View style={styles.reactions} testID="reactions">
          {REACTIONS.filter((r) => isStudent || !PACE_REACTIONS.includes(r)).map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityLabel={t(`reaction.${r}`)}
              onPress={() => {
                engine.react(r);
                setReactionsOpen(false);
              }}
              style={styles.reactionButton}
            >
              <Text style={styles.reactionEmoji}>{REACTION_EMOJI[r]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ControlSize.Provider value={bar.size}>
        {/* The lesson's buttons sit on one pane of glass that floats under the faces (A-224). */}
        <View style={[styles.controlsDock, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
          <Glass tone="night" floating radius={radius.full} style={styles.controlsPane}>
            <View style={[styles.controls, { gap: bar.gap }]} testID="room-controls">
              <Control
                label={media.audio ? t("mute") : t("unmute")}
                off={!media.audio}
                disabled={!hasAudio}
                onPress={() => engine.setAudio(!media.audio)}
                testID="toggle-mic"
              >
                {media.audio ? (
                  <Mic size={22} color={room.ink} />
                ) : (
                  <MicOff size={22} color={room.dangerInk} />
                )}
              </Control>
              <Control
                label={media.video ? t("cameraOff") : t("cameraOn")}
                off={!media.video}
                disabled={!hasCamera}
                onPress={() => engine.setVideo(!media.video)}
                testID="toggle-camera"
              >
                {media.video ? (
                  <Video size={22} color={room.ink} />
                ) : (
                  <VideoOff size={22} color={room.dangerInk} />
                )}
              </Control>
              {screenShare.available ? (
                <Control
                  label={sharing ? t("stopSharing") : t("shareScreen")}
                  on={sharing}
                  onPress={() => void (sharing ? engine.stopScreen() : engine.shareScreen())}
                  testID="toggle-share"
                >
                  <MonitorUp size={22} color={sharing ? room.activeInk : room.ink} />
                </Control>
              ) : null}
              {!isHost ? (
                <Control
                  label={media.hand ? t("lowerHand") : t("raiseHand")}
                  on={media.hand}
                  onPress={() => engine.setHand(!media.hand)}
                  testID="toggle-hand"
                >
                  <Hand size={22} color={media.hand ? room.activeInk : room.ink} />
                </Control>
              ) : null}
              <Control
                label={t("reactions")}
                on={reactionsOpen}
                onPress={() => setReactionsOpen((open) => !open)}
                testID="open-reactions"
              >
                <Smile size={22} color={reactionsOpen ? room.activeInk : room.ink} />
              </Control>
              <Control
                label={t("chat")}
                on={panel === "chat"}
                badge={panel === "chat" ? 0 : engine.unread}
                onPress={() => setPanel((cur) => (cur === "chat" ? null : "chat"))}
                testID="open-chat"
              >
                <MessageSquare size={22} color={panel === "chat" ? room.activeInk : room.ink} />
              </Control>
              <Control
                label={t("people")}
                on={panel === "people"}
                badge={isStudent ? 0 : handQueue.filter((h) => h.id !== SELF).length}
                onPress={() => setPanel((cur) => (cur === "people" ? null : "people"))}
                testID="open-people"
              >
                <Users size={22} color={panel === "people" ? room.activeInk : room.ink} />
              </Control>
              {isHost ? (
                <Control
                  label={tm("tools")}
                  on={toolsOn}
                  onPress={() => setPanel((cur) => (cur === "tools" ? null : "tools"))}
                  testID="open-tools"
                >
                  <LayoutGrid size={22} color={toolsOn ? room.activeInk : room.ink} />
                </Control>
              ) : null}
              <Control label={t("leave")} danger onPress={leave} testID="leave">
                <PhoneOff size={22} color={room.dangerInk} />
              </Control>
            </View>
          </Glass>
        </View>
      </ControlSize.Provider>

      {panelBody && !sideBySide ? (
        <View
          style={styles.sheetLayer}
          pointerEvents={sheetArmed ? "box-none" : "none"}
          testID={sheetArmed ? "room-sheet" : "room-sheet-opening"}
        >
          <Animated.View entering={FadeIn.duration(180)} style={styles.scrim}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPanel(null)}
              accessibilityLabel={t("dismiss")}
            />
          </Animated.View>
          <KeyboardAvoidingView
            // Android draws under the keyboard too (edge to edge), so both make room themselves.
            behavior="padding"
            style={[styles.sheet, { maxHeight: height * 0.72 }]}
          >
            {/* The keyboard-avoiding view sets its own bottom padding, so the room for
                the home indicator sits on a view of its own inside it. A list gets
                most of the sheet's height; with the keyboard up it gives that back.
                The sheet is glass and slides up from the bottom edge (A-224). */}
            <Animated.View
              entering={SlideInDown.duration(300)}
              style={[
                styles.sheetBody,
                { paddingBottom: Math.max(insets.bottom, space[3]) },
                panel && LIST_PANELS.includes(panel) && !keyboardUp
                  ? { minHeight: Math.max(280, Math.round(height * 0.6)) }
                  : null,
              ]}
            >
              <Glass tone="night" style={StyleSheet.absoluteFill} />
              {panelBody}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The panel beside the lesson on a tablet. The chat's field stays above the
 * keyboard: the view that makes the room works out the keyboard's overlap from
 * its place in its parent, not on the screen, so it is told how far down the
 * screen it starts. Without that it made too little room, by the height of
 * what is above the panel.
 */
function SidePanel({ children }: { children: ReactNode }) {
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [fromTop, setFromTop] = useState(0);
  return (
    <View
      ref={frame}
      style={styles.sidePanel}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setFromTop(Math.round(y)))}
    >
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={fromTop}
        style={styles.fill}
        testID="room-side-panel"
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const STRIP_TILE = { width: 148, height: 104 } as const;

/** Equal tiles that fill the space; more than fit scroll. */
function Wall({
  ids,
  render,
}: {
  ids: string[];
  render: (id: string, size: { width: number; height: number }) => ReactNode;
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((cur) =>
      cur && cur.width === width && cur.height === height ? cur : { width, height },
    );
  };
  let content: ReactNode = null;
  if (box && box.width > 0 && box.height > 0) {
    const columns = gridColumns(ids.length, box.width, box.height);
    const rows = Math.ceil(ids.length / columns);
    const tileWidth = Math.floor((box.width - GAP * (columns - 1)) / columns);
    const tileHeight = Math.max(120, Math.floor((box.height - GAP * (rows - 1)) / rows));
    content = (
      <ScrollView contentContainerStyle={styles.wall}>
        {ids.map((id) => render(id, { width: tileWidth, height: tileHeight }))}
      </ScrollView>
    );
  }
  return (
    <View style={styles.fill} onLayout={measure} testID="tile-wall">
      {content}
    </View>
  );
}

function PeoplePanel({
  engine,
  peers,
  handQueue,
  spotlightId,
  onClose,
}: {
  engine: CallEngine;
  peers: RemotePeer[];
  handQueue: Array<{ id: string; name: string; at: string }>;
  spotlightId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("video.room");
  const self = engine.self;
  const isHost = self.role === "HOST";
  const stage = engine.currentStage;
  const place = (id: string) => handQueue.findIndex((h) => h.id === id) + 1;
  return (
    <PanelFrame title={t("people")} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.people} keyboardShouldPersistTaps="handled">
        {isHost ? (
          <View style={styles.hostTools}>
            <RoomButton
              label={t("muteAll")}
              onPress={() => engine.mutePeers()}
              icon={<MicOff size={16} color={room.ink} />}
              testID="mute-all"
            />
            <RoomButton
              label={stage.focus ? t("focusOff") : t("focusOn")}
              onPress={() => engine.setStage({ focus: !stage.focus })}
              icon={<Focus size={16} color={room.ink} />}
              testID="toggle-focus"
            />
          </View>
        ) : null}
        <PersonRow
          name={t("you", { name: self.displayName })}
          audioOn={engine.media.audio}
          handPlace={engine.media.hand ? place(SELF) : 0}
          actions={
            isHost ? (
              <IconButton
                label={
                  spotlightId === SELF
                    ? t("unspotlight", { name: self.displayName })
                    : t("spotlight", { name: self.displayName })
                }
                on={spotlightId === SELF}
                onPress={() =>
                  engine.setStage({
                    spotlight: spotlightId === SELF ? null : self.participantId,
                  })
                }
              >
                <Star size={18} color={spotlightId === SELF ? room.activeInk : room.ink} />
              </IconButton>
            ) : null
          }
        />
        {peers.map((p) => (
          <PersonRow
            key={p.id}
            name={p.displayName}
            audioOn={Boolean(p.media?.audio)}
            handPlace={p.media?.hand ? place(p.id) : 0}
            actions={
              isHost ? (
                <>
                  {p.media?.hand ? (
                    <IconButton
                      label={t("lowerHandFor", { name: p.displayName })}
                      onPress={() => engine.lowerHand(p.id)}
                      testID={`lower-${p.id}`}
                    >
                      <Hand size={18} color={room.ink} />
                    </IconButton>
                  ) : null}
                  {p.media?.audio ? (
                    <IconButton
                      label={t("mutePerson", { name: p.displayName })}
                      onPress={() => engine.mutePeers([p.id])}
                      testID={`mute-${p.id}`}
                    >
                      <MicOff size={18} color={room.ink} />
                    </IconButton>
                  ) : null}
                  <IconButton
                    label={
                      spotlightId === p.id
                        ? t("unspotlight", { name: p.displayName })
                        : t("spotlight", { name: p.displayName })
                    }
                    on={spotlightId === p.id}
                    onPress={() =>
                      engine.setStage({ spotlight: spotlightId === p.id ? null : p.id })
                    }
                    testID={`spotlight-${p.id}`}
                  >
                    <Star size={18} color={spotlightId === p.id ? room.activeInk : room.ink} />
                  </IconButton>
                </>
              ) : null
            }
          />
        ))}
      </ScrollView>
    </PanelFrame>
  );
}

function PersonRow({
  name,
  audioOn,
  handPlace,
  actions,
}: {
  name: string;
  audioOn: boolean;
  /** Place in the hand queue; 0 = hand down. */
  handPlace: number;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.person}>
      {audioOn ? <Mic size={16} color={room.inkMuted} /> : <MicOff size={16} color={room.danger} />}
      <Text style={[styles.ink, styles.fill]} numberOfLines={1}>
        {name}
      </Text>
      {handPlace > 0 ? (
        <View style={styles.handBadge}>
          <Hand size={12} color={room.activeInk} />
          <Text style={styles.handBadgeText}>{handPlace}</Text>
        </View>
      ) : null}
      {actions}
    </View>
  );
}

function ChatPanel({ engine, onClose }: { engine: CallEngine; onClose: () => void }) {
  const t = useTranslations("video.room");
  const [text, setText] = useState("");
  const send = () => {
    engine.sendChat(text);
    setText("");
  };
  return (
    <PanelFrame title={t("chat")} onClose={onClose}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.chat}
        keyboardShouldPersistTaps="handled"
        ref={(list) => list?.scrollToEnd({ animated: false })}
      >
        {engine.chat.length === 0 ? (
          <Text variant="small" style={styles.inkMuted}>
            {t("chatEmpty")}
          </Text>
        ) : (
          engine.chat.map((line) => (
            <View key={line.id} style={[styles.chatLine, line.from === null && styles.chatMine]}>
              {line.from !== null ? (
                <Text variant="smallStrong" style={styles.inkMuted}>
                  {line.name}
                </Text>
              ) : null}
              <Text style={styles.ink}>{line.text}</Text>
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.chatInputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("chatPlaceholder")}
          placeholderTextColor={room.inkMuted}
          maxLength={CHAT_MAX_LENGTH}
          onSubmitEditing={send}
          returnKeyType="send"
          submitBehavior="submit"
          style={styles.chatInput}
          testID="chat-input"
        />
        <RoomButton label={t("send")} onPress={send} disabled={!text.trim()} testID="chat-send" />
      </View>
    </PanelFrame>
  );
}

function PanelFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("video.room");
  return (
    <View style={styles.panel} testID="room-panel">
      <View style={styles.panelHead}>
        <Text variant="heading" style={[styles.ink, styles.fill]}>
          {title}
        </Text>
        <IconButton label={t("dismiss")} onPress={onClose} testID="close-panel">
          <X size={20} color={room.ink} />
        </IconButton>
      </View>
      {children}
    </View>
  );
}

function Banner({
  children,
  onClose,
  testID,
}: {
  children: ReactNode;
  onClose?: () => void;
  testID?: string;
}) {
  const t = useTranslations("video.room");
  return (
    <View style={styles.banner} testID={testID}>
      <Text variant="small" style={[styles.ink, styles.fill]}>
        {children}
      </Text>
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("dismiss")}
        >
          <X size={16} color={room.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A round button of the bar at the bottom; `ControlSize` says how large. */
function Control({
  label,
  children,
  onPress,
  on = false,
  off = false,
  danger = false,
  disabled = false,
  badge = 0,
  testID,
}: {
  label: string;
  children: ReactNode;
  onPress: () => void;
  /** Switched on: turquoise. */
  on?: boolean;
  /** A microphone or camera that is off: red, so it is seen at a glance. */
  off?: boolean;
  danger?: boolean;
  disabled?: boolean;
  badge?: number;
  testID?: string;
}) {
  const size = useContext(ControlSize);
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: on }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      testID={testID}
      sink={0.88}
      dim={0.2}
      style={[
        styles.control,
        { width: size, height: size },
        on && styles.controlOn,
        (off || danger) && styles.controlDanger,
        disabled && styles.disabled,
      ]}
    >
      {children}
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : String(badge)}</Text>
        </View>
      ) : null}
    </Press>
  );
}

function IconButton({
  label,
  children,
  onPress,
  on = false,
  testID,
}: {
  label: string;
  children: ReactNode;
  onPress: () => void;
  on?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      testID={testID}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        on && styles.controlOn,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function RoomButton({
  label,
  onPress,
  icon,
  tone = "plain",
  busy = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  tone?: "plain" | "danger";
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.roomButton,
        tone === "danger" && styles.controlDanger,
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
      {/*
        The label takes the room that is left instead of hugging its words: a label exactly as
        wide as its text lost its last word on an Android tablet ("Turn everyone's microphone").
        It may still shrink, so a long one goes onto a second line instead of past the edge.
      */}
      <Text variant="smallStrong" style={[styles.ink, styles.buttonLabel]} numberOfLines={2}>
        {label}
      </Text>
      {/* As much room on the other side as the icon takes, so the label stays in the middle. */}
      {icon ? <View style={styles.buttonIcon} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: room.background },
  fill: { flex: 1 },
  row: { flexDirection: "row", gap: GAP },
  ink: { color: room.ink },
  buttonLabel: { flexGrow: 1, flexShrink: 1, textAlign: "center" },
  buttonIcon: { width: 18, alignItems: "center" },
  inkMuted: { color: room.inkMuted },
  activeInk: { color: room.activeInk },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  pace: {
    flexDirection: "row",
    gap: space[2],
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: room.surface,
  },
  notices: { paddingHorizontal: space[3], gap: space[1] },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    backgroundColor: room.surface,
    marginBottom: space[1],
  },
  body: { flex: 1, padding: GAP },
  strip: { flexGrow: 0, marginTop: GAP },
  stripSide: { flexGrow: 0, width: 204 },
  stripContent: { gap: GAP },
  wall: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  sidePanel: { width: 340 },
  reactions: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingBottom: space[2],
  },
  reactionButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surface,
  },
  reactionEmoji: { fontSize: 24, lineHeight: 30 },
  controlsDock: { alignItems: "center", paddingTop: space[2], paddingHorizontal: space[2] },
  controlsPane: { borderRadius: radius.full },
  controls: { flexDirection: "row", justifyContent: "center", padding: 6 },
  control: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surfaceRaised,
  },
  controlOn: { backgroundColor: room.active },
  controlDanger: { backgroundColor: room.danger },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.warning,
  },
  badgeText: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: room.activeInk },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: room.surfaceRaised,
  },
  roomButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
  },
  sheetLayer: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: room.scrim },
  sheet: { minHeight: 280 },
  sheetBody: {
    flexShrink: 1,
    minHeight: 280,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  // It grows to fill a side column and a tall sheet, and is never shorter than what is in it:
  // with `flex: 1` a sheet took the least height and cut the last tool off at the screen's edge.
  panel: {
    flexGrow: 1,
    flexShrink: 1,
    borderRadius: radius.lg,
    backgroundColor: room.surface,
    minHeight: 240,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: room.border,
  },
  leaveBody: { padding: space[4], gap: space[3] },
  people: { padding: space[3], gap: space[1] },
  hostTools: { gap: space[2], marginBottom: space[2] },
  person: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[1],
  },
  handBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: room.active,
  },
  handBadgeText: { fontFamily: font.semibold, fontSize: 12, color: room.activeInk },
  chat: { padding: space[3], gap: space[2] },
  chatLine: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
  },
  chatMine: { alignSelf: "flex-end", backgroundColor: "#22407a" },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    padding: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: room.border,
  },
  chatInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: room.background,
    color: room.ink,
    fontFamily: font.regular,
    fontSize: 15,
  },
});
