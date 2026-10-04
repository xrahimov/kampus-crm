"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { PhotoField } from "@/features/staff/photo-field";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { productSchema } from "@/lib/validation/coins";
import type { ProductCategoryDto, ProductDto } from "@/server/services/coins/marketplace.service";

type Input = z.input<typeof productSchema>;
type Output = z.output<typeof productSchema>;

/** "Yangi mahsulot" (EXP §10 Marketplace): image, name, category, price in coins, stock, active. */
export function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDto | null;
  categories: ProductCategoryDto[];
  onSaved: () => void;
}) {
  const t = useTranslations("coins.marketplace");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(productSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: {
      name: "",
      categoryId: "",
      imageUrl: null,
      priceCoins: 10,
      stock: 1,
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: product?.name ?? "",
      categoryId: product?.categoryId ?? categories[0]?.id ?? "",
      imageUrl: product?.imageUrl ?? null,
      priceCoins: product?.priceCoins ?? 10,
      stock: product?.stock ?? 1,
      isActive: product?.isActive ?? true,
    });
  }, [open, product, categories, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (product)
        await api(`/marketplace/products/${product.id}`, { method: "PATCH", body: values });
      else await api("/marketplace/products", { method: "POST", body: values });
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
      title={product ? t("editProduct") : t("addProduct")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="product-dialog"
    >
      <Controller
        control={form.control}
        name="imageUrl"
        render={({ field }) => (
          <PhotoField
            value={field.value ?? null}
            name={form.getValues("name") || "?"}
            onChange={field.onChange}
          />
        )}
      />
      <div className="space-y-2">
        <Label htmlFor="product-name">{t("productName")}</Label>
        <Input id="product-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="product-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="product-category">{t("category")}</Label>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id="product-category" aria-invalid={!!errors.categoryId}>
                <SelectValue
                  placeholder={categories.length === 0 ? t("noCategories") : undefined}
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {categories.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noCategories")}</p>
        )}
        <FieldError id="product-category-error" message={errors.categoryId?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-price">{t("price")}</Label>
          <Input
            id="product-price"
            type="number"
            min={1}
            aria-invalid={!!errors.priceCoins}
            {...form.register("priceCoins")}
          />
          <FieldError id="product-price-error" message={errors.priceCoins?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="product-stock">{t("stock")}</Label>
          <Input
            id="product-stock"
            type="number"
            min={0}
            aria-invalid={!!errors.stock}
            {...form.register("stock")}
          />
          <FieldError id="product-stock-error" message={errors.stock?.message} />
        </div>
      </div>
      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
            {t("active")}
          </label>
        )}
      />
    </FormDialog>
  );
}
