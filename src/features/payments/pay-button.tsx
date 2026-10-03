"use client";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { Page } from "@/lib/validation/common";
import type { PaymentOptionsDto } from "@/server/services/students/payments.service";
import type { StudentDetailDto, StudentRowDto } from "@/server/services/students/students.service";

import { PaymentDialog, type PayableMembership } from "./payment-dialog";

const LEFT = ["ARCHIVED", "GRADUATED"];

/** EXP §11 "TO'LOV": find a student, then the usual payment form. */
export function PayButton() {
  const t = useTranslations();
  const tp = useTranslations("payments");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentRowDto[]>([]);
  const [picked, setPicked] = useState<StudentDetailDto | null>(null);
  const [options, setOptions] = useState<PaymentOptionsDto | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setQuery("");
      setResults([]);
      setPicked(null);
    }
  }
  const searching = open && query.trim().length >= 2;

  useEffect(() => {
    if (!open || options) return;
    api<PaymentOptionsDto>("/payments/options")
      .then(setOptions)
      .catch(() => {});
  }, [open, options]);

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      api<Page<StudentRowDto>>(`/students?q=${encodeURIComponent(query.trim())}&pageSize=8`, {
        signal: controller.signal,
      })
        .then((page) => setResults(page.items))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [searching, query]);

  const memberships: PayableMembership[] = (picked?.groups ?? [])
    .filter((g) => !LEFT.includes(g.status))
    .map((g) => ({
      membershipId: g.membershipId,
      groupName: g.groupName,
      status: g.status,
      teacherName: g.teacherName,
      time: g.time,
    }));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="pay-button">
        <Wallet /> <span className="hidden sm:inline">{tp("pay")}</span>
      </Button>
      <Dialog open={open && !picked} onOpenChange={setOpen}>
        <DialogContent data-testid="pay-search">
          <DialogHeader>
            <DialogTitle>{tp("pay")}</DialogTitle>
            <DialogDescription>{tp("searchHint")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tp("findStudent")}
            aria-label={tp("findStudent")}
          />
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {(searching ? results : []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                  onClick={() => api<StudentDetailDto>(`/students/${s.id}`).then(setPicked)}
                >
                  <span className="truncate font-medium">{s.fullName}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.phone ?? ""}
                  </span>
                </button>
              </li>
            ))}
            {query.trim().length >= 2 && results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {t("common.nothingFound")}
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
      {picked && options && (
        <PaymentDialog
          open={open}
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
          studentName={picked.fullName}
          memberships={memberships}
          options={options}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
