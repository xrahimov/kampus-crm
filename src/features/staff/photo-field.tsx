"use client";

import { ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError, uploadFile } from "@/lib/api-client";

/** Photo picker: uploads at once and hands back the stored URL (EXP §4 "Rasm"). */
export function PhotoField({
  value,
  name,
  onChange,
}: {
  value: string | null;
  name: string;
  onChange: (url: string | null) => void;
}) {
  const t = useTranslations("staff.form");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const stored = await uploadFile(file);
      onChange(stored.url);
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields?.file?.[0] ?? e.message) : "errors.internal");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("photo")}</Label>
      <div className="flex items-center gap-3">
        <Avatar src={value} name={name} className="size-14 text-base" />
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
          <ImagePlus /> {busy ? t("uploading") : t("choosePhoto")}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            aria-label={t("removePhoto")}
          >
            <X />
          </Button>
        )}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
