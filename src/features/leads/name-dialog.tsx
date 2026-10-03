"use client";

import { useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { ApiError } from "@/lib/api-client";

/** One-field dialog for boards and columns ("Bo'lim nomi"), create or rename. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  onSubmit,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initial: string;
  onSubmit: (name: string) => Promise<void>;
  testId?: string;
  /** Extra fields under the name, such as the branch of a new board. */
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initial);
      setError(null);
      setFieldError(undefined);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setFieldError("validation.required");
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError(undefined);
    try {
      await onSubmit(value);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.fields?.name?.[0]) setFieldError(e.fields.name[0]);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId={testId}
    >
      <div className="space-y-2">
        <Label htmlFor="name-dialog-input">{label}</Label>
        <Input
          id="name-dialog-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!fieldError}
          autoFocus
        />
        <FieldError id="name-dialog-error" message={fieldError} />
      </div>
      {children}
    </FormDialog>
  );
}
