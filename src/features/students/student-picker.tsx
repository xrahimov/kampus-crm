"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { StudentRowDto } from "@/server/services/students/students.service";

interface Hit {
  id: string;
  fullName: string;
  phone: string | null;
}

/**
 * Picks one student by typing part of their name or phone; the centre has far
 * too many students for a select. Shows the chosen name with a clear button.
 */
export function StudentPicker({
  id,
  value,
  valueName,
  onChange,
  excludeId,
  placeholder,
  invalid,
}: {
  id: string;
  value: string | null;
  valueName: string | null;
  onChange: (id: string | null, name: string | null) => void;
  excludeId?: string | null;
  placeholder?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("students.picker");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  const searching = query.trim().length >= 2;
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await api<{ items: StudentRowDto[] }>(
          `/students?q=${encodeURIComponent(q)}&pageSize=8`,
        );
        if (cancelled) return;
        setHits(
          page.items
            .filter((s) => s.id !== excludeId)
            .map((s) => ({ id: s.id, fullName: s.fullName, phone: s.phone })),
        );
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, excludeId]);

  if (value) {
    return (
      <div className="flex items-center gap-2" data-testid={`${id}-selected`}>
        <span className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {valueName ?? value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("clear")}
          onClick={() => onChange(null, null)}
        >
          <X />
        </Button>
      </div>
    );
  }

  const shown = searching ? hits : [];
  return (
    <div className="relative">
      <Input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid}
        role="combobox"
        aria-expanded={open && shown.length > 0}
      />
      {open && shown.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.id, s.fullName);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="truncate">{s.fullName}</span>
                {s.phone && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {s.phone}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && searching && shown.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{t("noResults")}</p>
      )}
    </div>
  );
}
