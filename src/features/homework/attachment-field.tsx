"use client";

import { Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, uploadFile } from "@/lib/api-client";

/** What the attachment upload accepts: images, documents, audio and short video. */
export const ATTACHMENT_ACCEPT =
  "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,audio/*,video/mp4,video/webm";

/** A file picker that uploads at once and hands back the stored URL (staff side). */
export function AttachmentField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const t = useTranslations("groups.homework");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onChange((await uploadFile(file, "/uploads/documents")).url);
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.file?.[0] ?? e.message) : "errors.internal");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip /> {busy ? t("uploading") : value ? t("replaceFile") : t("chooseFile")}
        </Button>
        {value && (
          <>
            <a href={value} target="_blank" rel="noreferrer" className="text-sm underline">
              {t("openFile")}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              aria-label={t("removeFile")}
            >
              <X />
            </Button>
          </>
        )}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
