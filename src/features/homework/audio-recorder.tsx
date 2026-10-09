"use client";

import { Mic, Square, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** Longest recording, in seconds; the file limit is generous but a homework answer is short. */
const MAX_SECONDS = 300;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

type Status = "idle" | "recording" | "unsupported" | "denied";

/**
 * Records audio in the browser (speaking homework, A-141) and hands back a File
 * the forms upload like any attachment. Where the browser cannot record, it
 * says so and the ordinary file picker next to it still works.
 */
export function AudioRecorder({
  value,
  onChange,
  testId = "recorder",
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  testId?: string;
}) {
  const t = useTranslations("recorder");
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The parent dropped the file (the form was sent or reset): forget the preview too.
  if (value === null && preview) {
    URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function finish(file: File) {
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    onChange(file);
  }

  async function start() {
    if (
      typeof MediaRecorder === "undefined" ||
      typeof navigator.mediaDevices?.getUserMedia !== "function"
    ) {
      setStatus("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("denied");
      return;
    }
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0]!;
      const blob = new Blob(chunks.current, { type });
      finish(new File([blob], `recording.${EXTENSION[type] ?? "webm"}`, { type }));
      recorder.current = null;
    };
    recorder.current = rec;
    rec.start(1000);
    setSeconds(0);
    setStatus("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setStatus("idle");
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSeconds(0);
    onChange(null);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        {status === "recording" ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stop}
            data-testid={`${testId}-stop`}
          >
            <Square /> {t("stop")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={start}
            data-testid={`${testId}-start`}
          >
            <Mic /> {preview ? t("again") : t("start")}
          </Button>
        )}
        {status === "recording" && (
          <span className="text-sm tabular-nums text-destructive" aria-live="polite">
            ● {t("recording", { time: mmss })}
          </span>
        )}
        {preview && status !== "recording" && (
          <>
            <audio controls src={preview.url} className="h-8" data-testid={`${testId}-preview`} />
            <Button type="button" size="sm" variant="ghost" onClick={discard}>
              <Trash2 /> {t("discard")}
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {status === "unsupported"
          ? t("unsupported")
          : status === "denied"
            ? t("denied")
            : preview
              ? t("ready", { time: mmss })
              : t("hint")}
      </p>
    </div>
  );
}
