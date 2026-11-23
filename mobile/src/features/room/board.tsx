import { Download, Eraser, Trash2, Undo2, Users } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, G, Mask, Path, Rect } from "react-native-svg";

import { Text } from "@/components/text";
import { apiBytes } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { radius, space } from "@/lib/theme";
import {
  BOARD_COLORS,
  BOARD_STROKE_MAX_POINTS,
  BOARD_WIDTHS,
  type BoardStroke,
} from "@kampus/lib/validation/video";
import type { CallEngine } from "@kampus/lib/video/call-engine";

import { boardPicture } from "./board-picture";
import {
  BOARD_ASPECT,
  BOARD_BACKGROUND,
  BOARD_UNITS,
  boardHeight,
  boardPoint,
  eraserRuns,
  fitBox,
  strokePath,
  strokeWidth,
} from "./board-shapes";

/*
 * The shared whiteboard in the app (A-209): the same strokes everyone in the
 * lesson has, drawn as shapes. The teacher draws with a finger or a pencil,
 * students when the teacher lets them. The same surface, see-through, lies
 * over a shown page for pen marks.
 */

/** The pen in this person's hand: colour, width, or the eraser. */
export interface BoardTools {
  color: string;
  width: number;
  erase: boolean;
}

export function useBoardTools(): [BoardTools, (change: Partial<BoardTools>) => void] {
  const [tools, setTools] = useState<BoardTools>({
    color: BOARD_COLORS[0],
    width: BOARD_WIDTHS[1],
    erase: false,
  });
  return [tools, (change) => setTools((cur) => ({ ...cur, ...change }))];
}

type Stroke = BoardStroke & { by?: string | null };

function StrokePath({ stroke, height, color }: { stroke: Stroke; height: number; color: string }) {
  return (
    <Path
      d={strokePath(stroke.points, height)}
      stroke={color}
      strokeWidth={strokeWidth(stroke)}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

/** Every finished stroke of one layer. Redrawn only when the layer changes. */
const Strokes = memo(function Strokes({
  strokes,
  height,
  transparent,
  layer,
}: {
  strokes: readonly Stroke[];
  height: number;
  transparent: boolean;
  layer: string;
}) {
  if (!transparent) {
    // On the white board the eraser is a wide white pen.
    return (
      <>
        {strokes.map((s) => (
          <StrokePath
            key={s.id}
            stroke={s}
            height={height}
            color={s.erase ? BOARD_BACKGROUND : s.color}
          />
        ))}
      </>
    );
  }
  // Over a page the eraser hides what was drawn before it and leaves the page.
  const runs = eraserRuns(strokes);
  let drawn: React.ReactNode = null;
  const masks: React.ReactNode[] = [];
  runs.forEach((run, index) => {
    const pens = run.pens.map((s) => (
      <StrokePath key={s.id} stroke={s} height={height} color={s.color} />
    ));
    if (run.erasers.length === 0) {
      drawn = (
        <>
          {drawn}
          {pens}
        </>
      );
      return;
    }
    const id = `rub-${layer.replace(/[^a-z0-9]/gi, "-")}-${index}`;
    masks.push(
      <Mask
        key={id}
        id={id}
        x={0}
        y={0}
        width={BOARD_UNITS}
        height={height}
        maskUnits="userSpaceOnUse"
      >
        <Rect x={0} y={0} width={BOARD_UNITS} height={height} fill="#ffffff" />
        {run.erasers.map((s) => (
          <StrokePath key={s.id} stroke={s} height={height} color="#000000" />
        ))}
      </Mask>,
    );
    drawn = (
      <G mask={`url(#${id})`}>
        {drawn}
        {pens}
      </G>
    );
  });
  return (
    <>
      {masks.length > 0 ? <Defs>{masks}</Defs> : null}
      {drawn}
    </>
  );
});

/**
 * The drawing surface of one layer. It fills its parent, which must have the
 * shape the strokes were drawn on: 16:9 for the whiteboard, the page's own
 * shape over a shown page.
 */
export function BoardSurface({
  engine,
  layer,
  tools,
  aspect = BOARD_ASPECT,
  transparent = false,
  picture,
  style,
}: {
  engine: CallEngine;
  layer: string;
  tools: BoardTools;
  aspect?: number;
  /** True over a shown page: only the marks are painted. */
  transparent?: boolean;
  /** Where the drawn board is kept for whoever saves its picture. */
  picture?: RefObject<Svg | null>;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTranslations("video.board");
  const height = boardHeight(aspect);
  const canDraw = engine.canDraw;
  const version = engine.boardVersion;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the engine swaps its list on every change and counts it in `version`
  const strokes = useMemo(() => engine.boardLayer(layer), [engine, layer, version]);

  const [live, setLive] = useState<BoardStroke | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const drawing = useRef<BoardStroke | null>(null);

  const begin = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const stroke: BoardStroke = {
      id: `${engine.self.participantId.slice(-6)}-${Date.now().toString(36)}`,
      color: tools.color,
      width: tools.width,
      erase: tools.erase,
      layer,
      points: [boardPoint(locationX, locationY, size.current)],
    };
    drawing.current = stroke;
    setLive(stroke);
  };
  const move = (event: GestureResponderEvent) => {
    const stroke = drawing.current;
    if (!stroke) return;
    const { locationX, locationY } = event.nativeEvent;
    const point = boardPoint(locationX, locationY, size.current);
    let next: BoardStroke = { ...stroke, points: [...stroke.points, point] };
    if (next.points.length >= BOARD_STROKE_MAX_POINTS) {
      // A very long drag becomes several strokes.
      engine.drawStroke(next);
      next = { ...stroke, id: `${stroke.id}-${next.points.length}`, points: [point] };
    }
    drawing.current = next;
    setLive(next);
  };
  const finish = () => {
    const stroke = drawing.current;
    drawing.current = null;
    setLive(null);
    if (stroke) engine.drawStroke(stroke);
  };

  const measure = (event: LayoutChangeEvent) => {
    const { width, height: h } = event.nativeEvent.layout;
    size.current = { width, height: h };
  };

  return (
    <View style={[styles.surface, style]} testID="board-surface">
      <Svg
        ref={picture}
        width="100%"
        height="100%"
        viewBox={`0 0 ${BOARD_UNITS} ${height}`}
        preserveAspectRatio="none"
        accessibilityRole="image"
        accessibilityLabel={t("title")}
      >
        {transparent ? null : (
          <Rect x={0} y={0} width={BOARD_UNITS} height={height} fill={BOARD_BACKGROUND} />
        )}
        <Strokes strokes={strokes} height={height} transparent={transparent} layer={layer} />
        {live ? (
          <StrokePath
            stroke={live}
            height={height}
            color={
              live.erase ? (transparent ? "rgba(255,255,255,0.7)" : BOARD_BACKGROUND) : live.color
            }
          />
        ) : null}
      </Svg>
      {/* An empty layer on top takes the finger, so its place is measured from this surface. */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={measure}
        pointerEvents={canDraw ? "auto" : "none"}
        testID="board-touch"
        onStartShouldSetResponder={() => canDraw}
        onMoveShouldSetResponder={() => canDraw}
        // A drawing finger is not a scroll or a swipe back.
        onResponderTerminationRequest={() => false}
        onResponderGrant={begin}
        onResponderMove={move}
        onResponderRelease={finish}
        onResponderTerminate={finish}
      />
    </View>
  );
}

/** Pens, eraser, undo, and the teacher's switches for one layer. */
export function BoardToolbar({
  engine,
  layer,
  tools,
  onTools,
  onSave,
  dark = false,
  style,
}: {
  engine: CallEngine;
  layer: string;
  tools: BoardTools;
  onTools: (change: Partial<BoardTools>) => void;
  /** Present for the teacher on the whiteboard: saves it as a lesson material. */
  onSave?: () => Promise<void>;
  /** Over the room's dark bars the icons are light. */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTranslations("video.board");
  const isHost = engine.self.role === "HOST";
  const canDraw = engine.canDraw;
  const strokes = engine.boardLayer(layer);
  const ink = dark ? "#f1f4fa" : "#17234b";
  const chosen = dark ? "rgba(255,255,255,0.18)" : "rgba(23,35,75,0.12)";
  const { color, width, erase } = tools;
  const mine = strokes.some((s) => s.by === null);

  const [saving, setSaving] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (settle.current && clearTimeout(settle.current)), []);
  const save = async () => {
    if (!onSave) return;
    if (settle.current) clearTimeout(settle.current);
    setSaving("busy");
    try {
      await onSave();
      setSaving("saved");
    } catch {
      setSaving("failed");
    }
    // What happened stays long enough to be read, then the tools are as before.
    settle.current = setTimeout(() => setSaving("idle"), 4000);
  };

  return (
    <View style={[styles.toolbar, style]} testID="board-toolbar">
      {canDraw ? (
        <>
          {BOARD_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => onTools({ color: c, erase: false })}
              accessibilityRole="button"
              accessibilityLabel={t("color")}
              accessibilityState={{ selected: !erase && color === c }}
              style={[styles.tool, !erase && color === c && { backgroundColor: chosen }]}
              testID={`board-color-${c.slice(1)}`}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  dark && c === BOARD_COLORS[0] && styles.swatchRing,
                ]}
              />
            </Pressable>
          ))}
          {BOARD_WIDTHS.map((w) => (
            <Pressable
              key={w}
              onPress={() => onTools({ width: w, erase: false })}
              accessibilityRole="button"
              accessibilityLabel={t("width", { width: w })}
              accessibilityState={{ selected: !erase && width === w }}
              style={[styles.tool, !erase && width === w && { backgroundColor: chosen }]}
              testID={`board-width-${w}`}
            >
              <View
                style={{
                  width: 4 + w * 2,
                  height: 4 + w * 2,
                  borderRadius: radius.full,
                  backgroundColor: ink,
                }}
              />
            </Pressable>
          ))}
          <Pressable
            onPress={() => onTools({ erase: !erase })}
            accessibilityRole="button"
            accessibilityLabel={t("eraser")}
            accessibilityState={{ selected: erase }}
            style={[styles.tool, erase && { backgroundColor: chosen }]}
            testID="board-eraser"
          >
            <Eraser size={18} color={ink} />
          </Pressable>
          <Pressable
            onPress={() => engine.undoStroke(layer)}
            disabled={!mine}
            accessibilityRole="button"
            accessibilityLabel={t("undo")}
            style={[styles.tool, !mine && styles.dim]}
            testID="board-undo"
          >
            <Undo2 size={18} color={ink} />
          </Pressable>
        </>
      ) : (
        <Text variant="small" style={{ color: ink, opacity: 0.75 }} testID="board-view-only">
          {t("viewOnly")}
        </Text>
      )}
      {isHost ? (
        <>
          <View style={styles.spring} />
          <Pressable
            onPress={() => engine.setStudentsMayDraw(!engine.boardStudentsMayDraw)}
            accessibilityRole="button"
            accessibilityLabel={
              engine.boardStudentsMayDraw ? t("studentsDrawOff") : t("studentsDrawOn")
            }
            accessibilityState={{ selected: engine.boardStudentsMayDraw }}
            style={[styles.tool, engine.boardStudentsMayDraw && { backgroundColor: chosen }]}
            testID="board-students-draw"
          >
            <Users size={18} color={ink} />
          </Pressable>
          <Pressable
            onPress={() => engine.clearBoard(layer)}
            disabled={strokes.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t("clear")}
            style={[styles.tool, strokes.length === 0 && styles.dim]}
            testID="board-clear"
          >
            <Trash2 size={18} color={ink} />
          </Pressable>
          {onSave ? (
            <Pressable
              onPress={() => void save()}
              disabled={saving === "busy" || strokes.length === 0}
              accessibilityRole="button"
              accessibilityLabel={t("save")}
              style={[styles.tool, (saving === "busy" || strokes.length === 0) && styles.dim]}
              testID="board-save"
            >
              <Download size={18} color={ink} />
            </Pressable>
          ) : null}
          {saving !== "idle" ? (
            <Text
              variant="small"
              style={[styles.saved, { color: ink }]}
              accessibilityLiveRegion="polite"
              testID="board-save-state"
            >
              {saving === "busy" ? t("saving") : saving === "saved" ? t("saved") : t("saveFailed")}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** The whiteboard on the stage: its tools, and the board as large as the space allows. */
export function WhiteboardStage({ engine }: { engine: CallEngine }) {
  const [tools, setTools] = useBoardTools();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const picture = useRef<Svg | null>(null);
  // Only the teacher saves the board, under the lesson's materials (as on the site).
  const save =
    engine.self.role === "HOST"
      ? async () => {
          const png = await boardPicture(picture.current, engine.boardLayer(""));
          await apiBytes(`/video/rooms/${engine.self.roomId}/board`, png, "image/png");
        }
      : undefined;
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const next = fitBox({ width, height }, BOARD_ASPECT);
    setBox((cur) => (cur.width === next.width && cur.height === next.height ? cur : next));
  };
  return (
    <View style={styles.stage} testID="whiteboard">
      <BoardToolbar
        engine={engine}
        layer=""
        tools={tools}
        onTools={setTools}
        onSave={save}
        style={styles.onWhite}
      />
      <View style={styles.boardSpace} onLayout={measure} testID="board-space">
        {box.width > 0 ? (
          <BoardSurface engine={engine} layer="" tools={tools} picture={picture} style={box} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: "hidden" },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  onWhite: { backgroundColor: BOARD_BACKGROUND },
  tool: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: { width: 18, height: 18, borderRadius: radius.full },
  swatchRing: { borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  dim: { opacity: 0.35 },
  spring: { flexGrow: 1 },
  // What saving came to; on a narrow toolbar it takes a line of its own.
  saved: { paddingHorizontal: space[2], opacity: 0.8 },
  // The room's own dark surface around the board, so the white sheet reads as the board.
  stage: { flex: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#111a36" },
  boardSpace: { flex: 1, alignItems: "center", justifyContent: "center" },
});
