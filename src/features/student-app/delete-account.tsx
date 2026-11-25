"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";

/**
 * "Delete my account" for a signed-in student or parent (A-267): asks once,
 * deletes, and lands on the page that says what was deleted and what the
 * learning centre keeps.
 */
export function DeleteStudentAccount({ size = "sm" }: { size?: "sm" | "default" }) {
  const t = useTranslations("studentApp");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
        data-testid="student-delete-account"
      >
        <Trash2 /> {t("deleteAccount")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteTitle")}
        description={t("deleteText")}
        confirmLabel={t("deleteAccount")}
        onConfirm={async () => {
          await api("/student-auth/account", { method: "DELETE" });
          // The session cookie is gone: the page that says so is read fresh from the server.
          router.replace("/delete-account?done=1");
          router.refresh();
        }}
      />
    </>
  );
}
