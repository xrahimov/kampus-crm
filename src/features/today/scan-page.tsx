"use client";

import jsQR from "jsqr";
import { ArrowLeft, Camera, CameraOff, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { ScanResultDto, ScanStatus } from "@/server/services/groups/scan.service";

/** The browser's own QR reader where it exists (Chrome on Android and desktop); jsQR elsewhere. */
type Detector = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** The same badge is not sent again within this many milliseconds. */
const REPEAT_MS = 4000;

interface ScanLine {
  key: number;
  at: string;
  code: string;
  result: ScanResultDto | null;
  error: string | null;
}

const STATUS_VARIANT: Record<ScanStatus, "success" | "secondary" | "destructive" | "outline"> = {
  marked: "success",
  already: "secondary",
  noLesson: "outline",
  unknown: "destructive",
};

/**
 * Attendance by QR (A-139): the camera (or a hand scanner typing into the
 * field) reads a student badge; the student is marked present on the lesson
 * this page was opened for, else on their lesson of the day.
 */
export function ScanPage({
  lesson,
}: {
  lesson: { id: string; groupName: string; startTime: string; endTime: string } | null;
}) {
  const t = useTranslations("today.scan");
  const [lines, setLines] = useState<ScanLine[]>([]);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied" | "unsupported">("off");
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recent = useRef(new Map<string, number>());
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  /** Camera reads of the same badge are collapsed for a few seconds; a typed or hand-scanned code always goes. */
  async function send(code: string, options: { fromCamera: boolean }) {
    const now = Date.now();
    const last = recent.current.get(code);
    if (options.fromCamera && last && now - last < REPEAT_MS) return;
    recent.current.set(code, now);
    const key = (counter.current += 1);
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    try {
      const result = await api<ScanResultDto>("/attendance/scan", {
        method: "POST",
        body: { code, ...(lesson ? { lessonId: lesson.id } : {}) },
      });
      setLines((l) => [{ key, at, code, result, error: null }, ...l].slice(0, 50));
      beep(result.status === "marked" ? 880 : result.status === "already" ? 660 : 220);
    } catch (e) {
      const error = e instanceof ApiError ? e.message : "errors.internal";
      setLines((l) => [{ key, at, code, result: null, error }, ...l].slice(0, 50));
      beep(220);
    }
  }

  // The camera loop: a frame every ~250 ms through BarcodeDetector or jsQR.
  useEffect(() => {
    if (camera !== "starting") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const video = videoRef.current;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function tick() {
      if (cancelled || !video || video.readyState < 2) {
        if (!cancelled) timer = setTimeout(() => void tick(), 250);
        return;
      }
      try {
        let code: string | null = null;
        if (detector) {
          const found = await detector.detect(video);
          code = found[0]?.rawValue ?? null;
        } else if (ctx) {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const image = ctx.getImageData(0, 0, w, h);
            code = jsQR(image.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
        }
        if (code) void send(code, { fromCamera: true });
      } catch {
        // A frame that cannot be read is skipped.
      }
      if (!cancelled) timer = setTimeout(() => void tick(), 250);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
        setCamera("on");
        void tick();
      })
      .catch(() => {
        if (!cancelled) setCamera("denied");
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `send` reads refs only; the loop restarts only when the camera is switched on again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("off");
  }
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  function submitManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual("");
    void send(code, { fromCamera: false });
    inputRef.current?.focus();
  }

  const marked = lines.filter((l) => l.result?.status === "marked").length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/today">
          <ArrowLeft /> {t("back")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground" data-testid="scan-target">
          {lesson
            ? t("forLesson", {
                group: lesson.groupName,
                time: `${lesson.startTime}–${lesson.endTime}`,
              })
            : t("anyLesson")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="size-4 text-muted-foreground" /> {t("camera")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-md bg-black/80">
              <video
                ref={videoRef}
                className="size-full object-cover"
                muted
                playsInline
                data-testid="scan-video"
              />
              {camera === "on" && (
                <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
              )}
              {camera !== "on" && (
                <div className="absolute inset-0 flex items-center justify-center text-white/70">
                  <ScanLine className="size-10" strokeWidth={1.25} />
                </div>
              )}
            </div>
            {camera === "denied" && <Alert variant="destructive">{t("denied")}</Alert>}
            {camera === "unsupported" && <Alert>{t("unsupported")}</Alert>}
            {camera === "on" || camera === "starting" ? (
              <Button variant="outline" onClick={stopCamera} data-testid="scan-stop">
                <CameraOff /> {t("stop")}
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setCamera(
                    typeof navigator.mediaDevices?.getUserMedia === "function"
                      ? "starting"
                      : "unsupported",
                  )
                }
                data-testid="scan-start"
              >
                <Camera /> {t("start")}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("manual")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={submitManual} className="space-y-2">
              <Label htmlFor="scan-code">{t("code")}</Label>
              <Input
                id="scan-code"
                ref={inputRef}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="kampus:student:…"
                autoComplete="off"
                autoFocus
                data-testid="scan-code"
              />
              <p className="text-xs text-muted-foreground">{t("manualHint")}</p>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>{t("log")}</span>
            <span className="text-sm font-normal text-muted-foreground" data-testid="scan-count">
              {t("markedCount", { count: marked })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {lines.map((line) => (
                <li
                  key={line.key}
                  className="flex flex-wrap items-center gap-2 py-2"
                  data-testid="scan-line"
                  data-status={line.result?.status ?? "error"}
                >
                  <span className="text-xs text-muted-foreground tabular-nums">{line.at}</span>
                  <span className="min-w-0 flex-1">
                    {line.result?.studentName ? (
                      <>
                        <span className="font-medium">{line.result.studentName}</span>
                        {line.result.groupName && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {line.result.groupName} {line.result.lessonTime}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground break-all">{line.code}</span>
                    )}
                  </span>
                  {line.result ? (
                    <Badge variant={STATUS_VARIANT[line.result.status]}>
                      {t(`status.${line.result.status}`)}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">{t("status.error")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** A short tone so the person at the door hears the result without looking. */
function beep(frequency: number) {
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
    if (navigator.vibrate) navigator.vibrate(frequency > 500 ? 40 : [60, 40, 60]);
  } catch {
    // No sound is fine.
  }
}
