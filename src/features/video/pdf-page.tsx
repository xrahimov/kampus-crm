"use client";

import type * as PdfJs from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

/*
 * One page of a PDF drawn on a canvas (A-183). The room draws pages itself
 * instead of handing the file to the browser, because an embedded PDF shows
 * only its first page on iPhone and iPad, and because the teacher turns the
 * page for everyone. pdf.js is loaded on first use; its worker is served from
 * /pdfjs (a copy of the package's file, see scripts/copy-pdf-worker.mjs).
 */

type PdfLib = typeof PdfJs;
type PdfDocument = PdfJs.PDFDocumentProxy;

const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";
/** The widest canvas a page is drawn on; sharp on a large screen, light on a phone. */
const MAX_CANVAS_WIDTH = 2400;

let library: Promise<PdfLib> | null = null;
function loadLibrary(): Promise<PdfLib> {
  library ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    return lib;
  });
  library.catch(() => {
    library = null;
  });
  return library;
}

/** Open documents by address, so turning pages or switching the pen does not fetch again. */
const documents = new Map<string, Promise<PdfDocument>>();
function loadDocument(url: string): Promise<PdfDocument> {
  let doc = documents.get(url);
  if (!doc) {
    doc = loadLibrary().then((lib) => lib.getDocument({ url }).promise);
    documents.set(url, doc);
    doc.catch(() => documents.delete(url));
    // A lesson shows a handful of files; keep the last few.
    if (documents.size > 4) {
      const oldest = documents.keys().next().value;
      if (oldest !== undefined && oldest !== url) documents.delete(oldest);
    }
  }
  return doc;
}

export function PdfPage({
  url,
  page,
  onInfo,
  onError,
  onSurface,
}: {
  url: string;
  page: number;
  /** Reported once the page is known: how many pages, and the page's width / height. */
  onInfo: (info: { pages: number; aspect: number }) => void;
  onError: () => void;
  /** The canvas, for the recorder; null on unmount. */
  onSurface?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  // Bumped when the canvas changes size, so the page is drawn again at the new size.
  const [size, setSize] = useState(0);
  const callbacks = useRef({ onInfo, onError });
  useEffect(() => {
    callbacks.current = { onInfo, onError };
  });

  useEffect(() => {
    let alive = true;
    loadDocument(url)
      .then((d) => alive && setDoc(d))
      .catch(() => alive && callbacks.current.onError());
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSurface?.(canvas);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = Math.round(canvas.getBoundingClientRect().width);
    const observer = new ResizeObserver(() => {
      const width = Math.round(canvas.getBoundingClientRect().width);
      if (width === last) return;
      last = width;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setSize(width), 150);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      onSurface?.(null);
    };
    // The canvas element lives as long as the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void (async () => {
      try {
        const number = Math.min(Math.max(1, page), doc.numPages);
        const pdfPage = await doc.getPage(number);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        callbacks.current.onInfo({ pages: doc.numPages, aspect: base.width / base.height });
        const shown = canvas.getBoundingClientRect().width || 800;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.min(MAX_CANVAS_WIDTH, Math.max(320, shown * dpr));
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        // Drawn off screen first, so the page on screen never flashes empty.
        const sheet = document.createElement("canvas");
        sheet.width = Math.round(viewport.width);
        sheet.height = Math.round(viewport.height);
        task = pdfPage.render({ canvas: sheet, viewport });
        await task.promise;
        if (cancelled) return;
        canvas.width = sheet.width;
        canvas.height = sheet.height;
        canvas.getContext("2d")?.drawImage(sheet, 0, 0);
        canvas.dataset.page = String(number);
      } catch {
        // A cancelled drawing is not a failure; anything else is.
        if (!cancelled) callbacks.current.onError();
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, size]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full bg-white"
      data-testid="material-pdf-page"
    />
  );
}
