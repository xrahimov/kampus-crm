import {
  Focus,
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Smile,
  Star,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react-native";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { font, radius, space } from "@/lib/theme";
import { PACE_REACTIONS, REACTIONS } from "@kampus/lib/validation/video";
import { CHAT_MAX_LENGTH, type CallEngine, type RemotePeer } from "@kampus/lib/video/call-engine";
import { BOARD, MATERIAL, REACTION_EMOJI, roomView, SELF } from "@kampus/lib/video/room-view";

import { gridColumns, room } from "./look";
import { RemoteAudio } from "./platform";
import { Tile } from "./tile";

type Panel = "people" | "chat" | "leave" | null;

const GAP = space[2];
const NOTICE_MS = 6000;

/**
 * The lesson room (A-207): a stage for whoever leads (a shared screen, the
 * person the teacher shows, the teacher for a student) with everyone else in a
 * strip, or a wall of equal tiles when nobody leads. The same rules as the
 * site's room, from the same code; only the drawing is the app's own.
 */
export function CallScreen({
  engine,
  onLeave,
  onEndForAll,
}: {
  engine: CallEngine;
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
  // A file or the whiteboard on everyone's stage has no picture in the app yet: the
  // people stay as they are and a line says what the teacher shows.
  const stageElsewhere = stageKey === MATERIAL || stageKey === BOARD;
  const stageTile = stageKey && !stageElsewhere ? stageKey : null;
  const others = everyone.filter((id) => id !== stageTile);
  const sideBySide = wide && width > height;

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
              : t("breakoutIn", { number: breakout.mine })}
          </Banner>
        ) : null}
        {stageElsewhere ? <Banner>{tm("stageElsewhere")}</Banner> : null}
        {engine.noShow && isHost ? <Banner>{t("noShow")}</Banner> : null}
        {isStudent && engine.poll?.open ? <PollCard engine={engine} /> : null}
      </View>

      <View style={[styles.body, sideBySide && styles.row]}>
        <View style={[styles.fill, sideBySide && stageTile ? styles.row : null]}>
          {stageTile ? (
            <>
              <View style={styles.fill}>{tile(stageTile, true)}</View>
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
        {panelBody && sideBySide ? <View style={styles.sidePanel}>{panelBody}</View> : null}
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

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
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
        <Control label={t("leave")} danger onPress={leave} testID="leave">
          <PhoneOff size={22} color={room.dangerInk} />
        </Control>
      </View>

      {panelBody && !sideBySide ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          <Pressable
            style={styles.scrim}
            onPress={() => setPanel(null)}
            accessibilityLabel={t("dismiss")}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[styles.sheet, { maxHeight: height * 0.72, paddingBottom: insets.bottom }]}
          >
            {panelBody}
          </KeyboardAvoidingView>
        </View>
      ) : null}
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

/** A student's answer to the teacher's question (A-153). */
function PollCard({ engine }: { engine: CallEngine }) {
  const poll = engine.poll;
  if (!poll) return null;
  return (
    <View style={styles.poll} testID="poll-card">
      <Text variant="bodyStrong" style={styles.ink}>
        {poll.question}
      </Text>
      <View style={styles.pollOptions}>
        {poll.options.map((option, index) => {
          const chosen = poll.myVote === index;
          return (
            <Pressable
              key={`${index}-${option}`}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => engine.votePoll(index)}
              style={[styles.pollOption, chosen && styles.pollChosen]}
              testID={`poll-option-${index}`}
            >
              <Text variant="smallStrong" style={chosen ? styles.activeInk : styles.ink}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
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

/** A round button of the bar at the bottom: 52 points, the thumb's size. */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: on }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.control,
        on && styles.controlOn,
        (off || danger) && styles.controlDanger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
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
      {icon}
      <Text variant="smallStrong" style={styles.ink} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: room.background },
  fill: { flex: 1 },
  row: { flexDirection: "row", gap: GAP },
  ink: { color: room.ink },
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
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space[2],
    paddingTop: space[2],
    paddingHorizontal: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: room.border,
  },
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
  sheet: {
    minHeight: 280,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: room.surface,
  },
  panel: { flex: 1, borderRadius: radius.lg, backgroundColor: room.surface, minHeight: 240 },
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
  poll: {
    padding: space[3],
    gap: space[2],
    borderRadius: radius.md,
    backgroundColor: room.surface,
    borderWidth: 1,
    borderColor: room.active,
    marginBottom: space[1],
  },
  pollOptions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  pollOption: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
  },
  pollChosen: { backgroundColor: room.active },
});
