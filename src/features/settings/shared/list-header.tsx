"use client";

import { Plus } from "lucide-react";

import { SearchBox } from "@/components/data/search-box";
import { Button } from "@/components/ui/button";

export function ListHeader({
  title,
  description,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  description?: string;
  addLabel: string;
  onAdd: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button onClick={onAdd} data-testid="add-button">
          <Plus /> {addLabel}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox />
        {children}
      </div>
    </div>
  );
}
