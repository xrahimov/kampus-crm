"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { roomSchema } from "@/lib/validation/settings";
import type { RoomDto } from "@/server/services/settings/rooms.service";

import { BranchSelect, type BranchOption } from "../shared/branch-select";
import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof roomSchema>;
type Output = z.output<typeof roomSchema>;

export function RoomDialog({
  open,
  onOpenChange,
  room,
  branches,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: RoomDto | null;
  branches: BranchOption[];
  defaultBranchId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.rooms");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(roomSchema),
    defaultValues: { branchId: defaultBranchId, name: "", capacity: 10 },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      room
        ? { branchId: room.branchId, name: room.name, capacity: room.capacity }
        : { branchId: defaultBranchId, name: "", capacity: 10 },
    );
  }, [open, room, defaultBranchId, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (room) {
        const { branchId: _branchId, ...rest } = values;
        await api(`/rooms/${room.id}`, { method: "PATCH", body: rest });
      } else {
        await api("/rooms", { method: "POST", body: values });
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={room ? t("edit") : t("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="room-dialog"
    >
      {!room && (
        <Controller
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <BranchSelect
              id="room-branch"
              branches={branches}
              value={field.value}
              onChange={field.onChange}
              error={errors.branchId?.message}
            />
          )}
        />
      )}
      <div className="space-y-2">
        <Label htmlFor="room-name">{t("name")}</Label>
        <Input id="room-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="room-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="room-capacity">{t("capacity")}</Label>
        <Input
          id="room-capacity"
          type="number"
          inputMode="numeric"
          min={1}
          aria-invalid={!!errors.capacity}
          {...form.register("capacity")}
        />
        <FieldError id="room-capacity-error" message={errors.capacity?.message} />
      </div>
    </FormDialog>
  );
}
