"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} />;
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "aspect-square size-4 rounded-full border border-input text-primary shadow-xs focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-2 fill-primary text-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

/**
 * Segmented control (the reference's "Foiz / Oylik / Dars haqi / Talaba ulushi"
 * switch, EXP §4): a radio group rendered as adjoining buttons.
 */
function SegmentedGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      className={cn("inline-flex w-full rounded-md border bg-muted p-0.5", className)}
      {...props}
    />
  );
}

function SegmentedItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "flex-1 rounded-sm px-2 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export { RadioGroup, RadioGroupItem, SegmentedGroup, SegmentedItem };
