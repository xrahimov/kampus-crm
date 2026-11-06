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
): void {
  ctx.fillStyle = BOARD_BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Pen widths are given for a 1600px-wide board and scale with it.
  const scale = width / EXPORT_WIDTH;
  for (const s of strokes) {
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
  const t = useTranslations("video.board");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [width, setWidth] = useState<number>(BOARD_WIDTHS[1]);
  const [erase, setErase] = useState(false);
  const [saving, setSaving] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const live = useRef<BoardStroke | null>(null);
  const isHost = engine.self.role === "HOST";
  const canDraw = engine.canDraw;
  const version = engine.boardVersion;

  // Redraw on every change and whenever the box changes size.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const draw = () => {
      const rect = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const strokes = live.current ? [...engine.board, live.current] : engine.board;
      paint(ctx, strokes, canvas.width, canvas.height);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [engine, version]);

  const pointOf = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [Number(x.toFixed(4)), Number(y.toFixed(4))];
  };

  const repaintLive = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const strokes = live.current ? [...engine.board, live.current] : engine.board;
    paint(ctx, strokes, canvas.width, canvas.height);
  };

  const finish = () => {
    const s = live.current;
    live.current = null;
    if (s) engine.drawStroke(s);
    else repaintLive();
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = {
      id: `${engine.self.participantId.slice(-6)}-${Date.now().toString(36)}`,
      color,
      width,
      erase,
      points: [pointOf(e)],
    };
    repaintLive();
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
    repaintLive();
  };

  const save = async () => {
    if (!onSave) return;
    setSaving("busy");
    try {
      await onSave(await boardToPng(engine.board));
      setSaving("saved");
    } catch {
      setSaving("failed");
    }
    setTimeout(() => setSaving("idle"), 4000);
  };

  const tool =
    "grid size-8 place-items-center rounded-md text-sidebar hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-sidebar-active disabled:opacity-40";

  return (
    <div
      className="flex size-full flex-col overflow-hidden rounded-lg bg-white"
      data-testid="whiteboard"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-black/10 px-2 py-1.5 text-sidebar">
        {canDraw ? (
          <>
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  setErase(false);
                }}
                aria-label={t("color")}
                aria-pressed={!erase && color === c}
                className={cn(
                  "grid size-8 place-items-center rounded-md hover:bg-black/10",
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
                onClick={() => {
                  setWidth(w);
                  setErase(false);
                }}
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
              onClick={() => setErase((v) => !v)}
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
              onClick={() => engine.undoStroke()}
              disabled={!engine.board.some((s) => s.by === null)}
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
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-black/10",
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
              onClick={() => engine.clearBoard()}
              disabled={engine.board.length === 0}
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
                disabled={saving === "busy" || engine.board.length === 0}
                title={t("save")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sidebar px-2.5 text-xs text-white hover:bg-sidebar/90 disabled:opacity-40"
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
      <div ref={boxRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className={cn("absolute inset-0 size-full touch-none", canDraw ? "cursor-crosshair" : "")}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={() => live.current && finish()}
          role="img"
          aria-label={t("title")}
          data-testid="board-canvas"
        />
      </div>
    </div>
  );
}
