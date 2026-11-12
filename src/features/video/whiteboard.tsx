"use client";

import { Download, Eraser, Pencil, Trash2, Undo2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  BOARD_COLORS,
  BOARD_STROKE_MAX_POINTS,
  BOARD_WIDTHS,
  type BoardStroke,
} from "@/lib/validation/video";
import { cn } from "@/lib/utils";

import type { CallEngine } from "./call-engine";

/** The board's background; the eraser paints with it. */
export const BOARD_BACKGROUND = "#ffffff";
/** Export size of the saved picture (16:9). */
const EXPORT_WIDTH = 1600;
const EXPORT_HEIGHT = 900;

function paint(
  ctx: CanvasRenderingContext2D,
  strokes: readonly BoardStroke[],
  width: number,
  height: number,
  /** Over a shown page (A-183): nothing is filled, and the eraser rubs the marks out. */
  transparent = false,
): void {
  ctx.globalCompositeOperation = "source-over";
  if (transparent) ctx.clearRect(0, 0, width, height);
  else {
    ctx.fillStyle = BOARD_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Pen widths are given for a 1600px-wide board and scale with it.
  const scale = width / EXPORT_WIDTH;
  for (const s of strokes) {
    ctx.globalCompositeOperation = transparent && s.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = s.erase ? BOARD_BACKGROUND : s.color;
    ctx.lineWidth = Math.max(1, s.width * (s.erase ? 6 : 1) * scale);
    ctx.beginPath();
    s.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * width, y * height);
      else ctx.lineTo(x * width, y * height);
    });
    if (s.points.length === 1) ctx.lineTo(s.points[0]![0] * width + 0.1, s.points[0]![1] * height);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

/** The board as a PNG, for saving it under the lesson's materials. */
export function boardToPng(strokes: readonly BoardStroke[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  paint(canvas.getContext("2d")!, strokes, EXPORT_WIDTH, EXPORT_HEIGHT);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
  );
}

/** The pen a browser draws with: colour, width, or the eraser. */
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

/**
 * The shared whiteboard on the call's stage (A-155): everyone sees the same
 * strokes; the teacher, and students when allowed, draw with a pen or eraser.
 */
export function Whiteboard({
  engine,
  onSave,
}: {
  engine: CallEngine;
  /** Present for the teacher: saves the board as a lesson material. */
  onSave?: (blob: Blob) => Promise<void>;
}) {
  const [tools, setTools] = useBoardTools();
  return (
    <div
      className="flex size-full flex-col overflow-hidden rounded-lg bg-white"
      data-testid="whiteboard"
    >
      <BoardToolbar engine={engine} layer="" tools={tools} onTools={setTools} onSave={onSave} />
      <div className="relative min-h-0 flex-1">
        <BoardCanvas engine={engine} layer="" tools={tools} />
      </div>
    </div>
  );
}

/**
 * The pens, eraser, undo and the teacher's switches for one layer: the
 * whiteboard (""), or the pen marks over one page of a shown material (A-183).
 */
export function BoardToolbar({
  engine,
  layer,
  tools,
  onTools,
  onSave,
  className,
}: {
  engine: CallEngine;
  layer: string;
  tools: BoardTools;
  onTools: (change: Partial<BoardTools>) => void;
  /** Present for the teacher on the whiteboard: saves it as a lesson material. */
  onSave?: (blob: Blob) => Promise<void>;
  className?: string;
}) {
  const t = useTranslations("video.board");
  const [saving, setSaving] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const isHost = engine.self.role === "HOST";
  const canDraw = engine.canDraw;
  const strokes = engine.boardLayer(layer);
  const { color, width, erase } = tools;

  const save = async () => {
    if (!onSave) return;
    setSaving("busy");
    try {
      await onSave(await boardToPng(engine.boardLayer(layer)));
      setSaving("saved");
    } catch {
      setSaving("failed");
    }
    setTimeout(() => setSaving("idle"), 4000);
  };

  const tool =
    "grid size-8 place-items-center rounded-md text-sidebar hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-sidebar-active disabled:opacity-40 pointer-coarse:size-10";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 border-b border-black/10 bg-white px-2 py-1.5 text-sidebar",
        className,
      )}
      data-testid="board-toolbar"
    >
      {canDraw ? (
        <>
          {BOARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onTools({ color: c, erase: false })}
              aria-label={t("color")}
              aria-pressed={!erase && color === c}
              className={cn(
                "grid size-8 place-items-center rounded-md hover:bg-black/10 pointer-coarse:size-10",
                !erase && color === c && "bg-black/10",
              )}
            >
              <span className="size-4 rounded-full" style={{ backgroundColor: c }} />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
          {BOARD_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onTools({ width: w, erase: false })}
              aria-label={t("width", { width: w })}
              aria-pressed={!erase && width === w}
              className={cn(tool, !erase && width === w && "bg-black/10")}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: 4 + w * 2, height: 4 + w * 2 }}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onTools({ erase: !erase })}
            aria-label={t("eraser")}
            aria-pressed={erase}
            title={t("eraser")}
            className={cn(tool, erase && "bg-black/10")}
            data-testid="board-eraser"
          >
            <Eraser className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => engine.undoStroke(layer)}
            disabled={!strokes.some((s) => s.by === null)}
            aria-label={t("undo")}
            title={t("undo")}
            className={tool}
            data-testid="board-undo"
          >
            <Undo2 className="size-4" />
          </button>
        </>
      ) : (
        <span className="flex items-center gap-1.5 px-1 text-xs text-sidebar/70">
          <Pencil className="size-3.5" /> {t("viewOnly")}
        </span>
      )}
      <span className="flex-1" />
      {isHost && (
        <>
          <button
            type="button"
            onClick={() => engine.setStudentsMayDraw(!engine.boardStudentsMayDraw)}
            aria-pressed={engine.boardStudentsMayDraw}
            title={engine.boardStudentsMayDraw ? t("studentsDrawOff") : t("studentsDrawOn")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-black/10 pointer-coarse:h-10",
              engine.boardStudentsMayDraw && "bg-black/10",
            )}
            data-testid="board-students-draw"
          >
            <Users className="size-4" />
            <span className="hidden sm:inline">
              {engine.boardStudentsMayDraw ? t("studentsDrawing") : t("studentsDrawOn")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => engine.clearBoard(layer)}
            disabled={strokes.length === 0}
            aria-label={t("clear")}
            title={t("clear")}
            className={tool}
            data-testid="board-clear"
          >
            <Trash2 className="size-4" />
          </button>
          {onSave && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving === "busy" || strokes.length === 0}
              title={t("save")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sidebar px-2.5 text-xs text-white hover:bg-sidebar/90 disabled:opacity-40 pointer-coarse:h-10"
              data-testid="board-save"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">
                {saving === "busy"
                  ? t("saving")
                  : saving === "saved"
                    ? t("saved")
                    : saving === "failed"
                      ? t("saveFailed")
                      : t("save")}
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The drawing surface of one layer; it fills its (positioned) parent. Strokes
 * are kept in 0-1 coordinates of the surface, so the parent must have the same
 * shape in every browser: the whole board, or exactly one shown page.
 */
export function BoardCanvas({
  engine,
  layer,
  tools,
  transparent = false,
}: {
  engine: CallEngine;
  layer: string;
  tools: BoardTools;
  /** True over a shown page: only the marks are painted. */
  transparent?: boolean;
}) {
  const t = useTranslations("video.board");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<BoardStroke | null>(null);
  const canDraw = engine.canDraw;
  const version = engine.boardVersion;

  const repaint = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const strokes = engine.boardLayer(layer);
    paint(
      ctx,
      live.current ? [...strokes, live.current] : strokes,
      canvas.width,
      canvas.height,
      transparent,
    );
  };

  // Redraw on every change and whenever the surface changes size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const strokes = engine.boardLayer(layer);
      paint(
        ctx,
        live.current ? [...strokes, live.current] : strokes,
        canvas.width,
        canvas.height,
        transparent,
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [engine, version, layer, transparent]);

  const pointOf = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [Number(x.toFixed(4)), Number(y.toFixed(4))];
  };

  const finish = () => {
    const s = live.current;
    live.current = null;
    if (s) engine.drawStroke(s);
    else repaint();
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = {
      id: `${engine.self.participantId.slice(-6)}-${Date.now().toString(36)}`,
      color: tools.color,
      width: tools.width,
      erase: tools.erase,
      layer,
      points: [pointOf(e)],
    };
    repaint();
  };
  const onMove = (e: React.PointerEvent) => {
    const s = live.current;
    if (!s) return;
    s.points.push(pointOf(e));
    if (s.points.length >= BOARD_STROKE_MAX_POINTS) {
      // A very long drag becomes several strokes.
      const last = s.points[s.points.length - 1]!;
      finish();
      live.current = { ...s, id: `${s.id}-${s.points.length}`, points: [last] };
    }
    repaint();
  };

  return (
    <canvas
      ref={canvasRef}
      // Whoever cannot draw only looks: touches pass through, so a zoomed page still scrolls.
      className={cn(
        "absolute inset-0 size-full",
        canDraw ? "cursor-crosshair touch-none" : "pointer-events-none",
      )}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={() => live.current && finish()}
      role="img"
      aria-label={t("title")}
      data-testid="board-canvas"
    />
  );
}
