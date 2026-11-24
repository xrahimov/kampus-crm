import { Gift, ImagePlus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import {
  uploadPicture,
  useAddPurchaseRequest,
  useCategoryStep,
  useCoinHistory,
  useCoinStudents,
  useSaveProduct,
  type CoinStudent,
  type CoinTransaction,
  type Product,
  type ProductCategory,
} from "@/api/office-coins";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Divider, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { choosePhoto } from "@/features/files/pick";
import { fileSource } from "@/features/room/file-source";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { radius, space, useTheme } from "@/lib/theme";

/** A whole number as it is typed, spaces allowed; null when it is not one within the bounds. */
export function typedCount(text: string, min: number, max: number): number | null {
  const bare = text.replace(/\s/g, "");
  if (!/^\d+$/.test(bare)) return null;
  const value = Number(bare);
  return value >= min && value <= max ? value : null;
}

/** A product's picture, or a gift where it has none or the picture does not load. */
export function ProductPicture({
  url,
  size = 44,
  testID,
}: {
  url: string | null;
  size?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const box = { width: size, height: size, borderRadius: radius.md };
  if (!url || failed === url) {
    return (
      <View style={[styles.noPicture, box, { backgroundColor: colors.secondary }]} testID={testID}>
        <Gift size={size * 0.45} color={colors.mutedForeground} />
      </View>
    );
  }
  return (
    <Image
      source={fileSource(url)}
      onError={() => setFailed(url)}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      style={[box, { backgroundColor: colors.secondary }]}
      testID={testID}
    />
  );
}

/** What a row of a student's coins is for, the way the site names it. */
function reasonOf(row: CoinTransaction, t: (key: string) => string): string {
  return (
    row.reasonName ??
    (row.event ? t(`events.${row.event}`) : (row.comment ?? t(`kinds.${row.kind}`)))
  );
}

/** "View": one student's balance and every time coins came or went. */
export function CoinHistorySheet({
  student,
  onClose,
}: {
  student: { studentId: string; fullName: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const tr = useTranslations("coins.report");
  const date = useDate();
  const { colors } = useTheme();
  const history = useCoinHistory(student?.studentId ?? null);
  return (
    <Sheet
      open={student !== null}
      onClose={onClose}
      title={student?.fullName ?? ""}
      testID="coin-history"
    >
      {history.error ? (
        <Notice tone="destructive">{errorText(t, history.error)}</Notice>
      ) : !history.data ? (
        <Loading />
      ) : (
        <View style={styles.form}>
          <Text tone="mutedForeground" testID="coin-history-balance">
            {tr("balance", { count: history.data.balance })}
          </Text>
          {history.data.items.length === 0 ? (
            <Text tone="mutedForeground">{t("common.nothingFound")}</Text>
          ) : (
            <View>
              {history.data.items.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.historyRow} testID={`coin-history-${row.id}`}>
                    <View style={styles.fill}>
                      <Text numberOfLines={2}>
                        {[reasonOf(row, tr), row.groupName].filter(Boolean).join(", ")}
                      </Text>
                      <Text variant="small" tone="mutedForeground">
                        {[date(new Date(row.createdAt), { dateStyle: "medium" }), row.givenByName]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    </View>
                    <Text
                      variant="bodyStrong"
                      style={{ color: row.amount < 0 ? colors.destructive : colors.success }}
                    >
                      {row.amount > 0 ? `+${row.amount}` : String(row.amount)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** "Categories": add one, and remove one that has no products. */
export function CategoriesSheet({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: ProductCategory[];
}) {
  const t = useTranslations();
  const tm = useTranslations("coins.marketplace");
  const { colors } = useTheme();
  const step = useCategoryStep();
  const [name, setName] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      step.reset();
    }
  }
  const fieldError = fieldErrorOf(t, step.error);
  const add = () => {
    const typed = name.trim();
    if (typed) step.mutate({ do: "add", name: typed }, { onSuccess: () => setName("") });
  };
  return (
    <Sheet open={open} onClose={onClose} title={tm("categories")} testID="categories">
      <View style={styles.form}>
        {step.error && !fieldError("name") ? (
          <Notice tone="destructive" testID="categories-problem">
            {errorText(t, step.error)}
          </Notice>
        ) : null}
        {categories.length === 0 ? (
          <Text tone="mutedForeground">{tm("noCategories")}</Text>
        ) : (
          <View>
            {categories.map((category, index) => (
              <View key={category.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.categoryRow} testID={`category-${category.id}`}>
                  <Text style={styles.fill} numberOfLines={2}>
                    {category.name}
                  </Text>
                  <Text tone="mutedForeground">{category.productCount}</Text>
                  {/* A category with products cannot go: the site greys its Delete out. */}
                  <Pressable
                    onPress={() => step.mutate({ do: "remove", id: category.id })}
                    disabled={step.isPending || category.productCount > 0}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: category.productCount > 0 }}
                    accessibilityLabel={`${t("common.delete")}: ${category.name}`}
                    hitSlop={8}
                    style={[styles.remove, category.productCount > 0 ? styles.off : null]}
                    testID={`category-${category.id}-remove`}
                  >
                    <Trash2 size={18} color={colors.destructive} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        <Divider />
        <Field
          label={tm("categoryName")}
          value={name}
          onChangeText={setName}
          maxLength={80}
          error={fieldError("name")}
          testID="categories-name"
        />
        <Button
          label={t("common.add")}
          onPress={add}
          loading={step.isPending}
          disabled={!name.trim()}
          testID="categories-add"
        />
      </View>
    </Sheet>
  );
}

/** "Add product" and "Edit product": the picture, name, category, price in coins, stock, active. */
export function ProductSheet({
  open,
  onClose,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  categories: ProductCategory[];
}) {
  const t = useTranslations();
  const tm = useTranslations("coins.marketplace");
  const tp = useTranslations("staff.form");
  const th = useTranslations("mobile.homework");
  const { colors } = useTheme();
  const save = useSaveProduct(product?.id ?? null);
  const [name, setName] = useState("");
  const [categoryId, setCategory] = useState<string | null>(null);
  const [imageUrl, setImage] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isActive, setActive] = useState(true);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [pictureProblem, setPictureProblem] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(product?.name ?? "");
      setCategory(product?.categoryId ?? categories[0]?.id ?? null);
      setImage(product?.imageUrl ?? null);
      setPrice(String(product?.priceCoins ?? 10));
      setStock(String(product?.stock ?? 1));
      setActive(product?.isActive ?? true);
      setTried(false);
      setPictureProblem(null);
      save.reset();
    }
  }
  const priceCoins = typedCount(price, 1, 100_000);
  const inStock = typedCount(stock, 0, 1_000_000);
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (tried && empty ? t("validation.required") : null);

  const pick = async () => {
    setPictureProblem(null);
    const picked = await choosePhoto({ smallSquare: true }).catch(() => ({
      kind: "none" as const,
    }));
    if (picked.kind === "refused") setPictureProblem(th(picked.reason));
    if (picked.kind !== "file") return;
    setSending(true);
    try {
      setImage((await uploadPicture(picked.file)).url);
    } catch (e) {
      setPictureProblem(fieldErrorOf(t, e)("file") ?? errorText(t, e));
    } finally {
      setSending(false);
    }
  };
  const submit = () => {
    if (!name.trim() || !categoryId || priceCoins === null || inStock === null) {
      setTried(true);
      return;
    }
    save.mutate(
      { name: name.trim(), categoryId, imageUrl, priceCoins, stock: inStock, isActive },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tm(product ? "editProduct" : "addProduct")}
      testID="product"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          disabled={sending}
          onPress={submit}
          testID="product-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="product-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <View style={styles.picture}>
          <ProductPicture url={imageUrl} size={64} testID="product-picture" />
          <View style={styles.pictureButtons}>
            <Button
              compact
              variant="outline"
              icon={<ImagePlus size={16} color={colors.foreground} />}
              label={tp(sending ? "uploading" : "choosePhoto")}
              onPress={() => void pick()}
              disabled={sending}
              testID="product-picture-choose"
            />
            {imageUrl ? (
              <Button
                compact
                variant="ghost"
                label={tp("removePhoto")}
                onPress={() => setImage(null)}
                disabled={sending}
                testID="product-picture-remove"
              />
            ) : null}
          </View>
        </View>
        {pictureProblem ? (
          <Notice tone="destructive" testID="product-picture-problem">
            {pictureProblem}
          </Notice>
        ) : null}
        <Field
          label={tm("productName")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? required(!name.trim())}
          testID="product-name"
        />
        <Select
          label={tm("category")}
          value={categoryId}
          onChange={(value) => setCategory(value ?? categoryId)}
          placeholder={categories.length === 0 ? tm("noCategories") : undefined}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          error={
            fieldError("categoryId") ??
            (tried && !categoryId
              ? categories.length === 0
                ? tm("noCategories")
                : t("validation.required")
              : null)
          }
          testID="product-category"
        />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <Field
              label={tm("price")}
              value={price}
              onChangeText={setPrice}
              keyboardType="number-pad"
              maxLength={7}
              error={
                fieldError("priceCoins") ??
                (tried && priceCoins === null
                  ? t(price.trim() ? "validation.min" : "validation.required")
                  : null)
              }
              testID="product-price"
            />
          </View>
          <View style={styles.fill}>
            <Field
              label={tm("stock")}
              value={stock}
              onChangeText={setStock}
              keyboardType="number-pad"
              maxLength={8}
              error={
                fieldError("stock") ??
                (tried && inStock === null
                  ? t(stock.trim() ? "validation.integer" : "validation.required")
                  : null)
              }
              testID="product-stock"
            />
          </View>
        </View>
        <Check label={tm("active")} value={isActive} onChange={setActive} testID="product-active" />
      </View>
    </Sheet>
  );
}

/** "New request": staff asks for a product on a student's behalf. */
export function PurchaseRequestSheet({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  /** The products that can be asked for: active and in stock. */
  products: Product[];
}) {
  const t = useTranslations();
  const tr = useTranslations("coins.requests");
  const { colors } = useTheme();
  const add = useAddPurchaseRequest();
  const [typed, setTyped] = useState("");
  const [student, setStudent] = useState<CoinStudent | null>(null);
  const [productId, setProduct] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped("");
      setStudent(null);
      setProduct(null);
      setTried(false);
      add.reset();
    }
  }
  const q = useRested(typed.trim());
  // Only what is in the field is searched for: a rested value from before a pick is not.
  const found = useCoinStudents(q, open && student === null && q === typed.trim());
  const product = products.find((p) => p.id === productId) ?? null;
  const tooDear = product !== null && student !== null && student.balance < product.priceCoins;
  const fieldError = fieldErrorOf(t, add.error);
  const submit = () => {
    if (!student || !productId || tooDear) {
      setTried(true);
      return;
    }
    add.mutate({ studentId: student.id, productId }, { onSuccess: onClose });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr("add")}
      testID="request"
      footer={
        <Button
          label={t("common.save")}
          loading={add.isPending}
          disabled={tooDear}
          onPress={submit}
          testID="request-save"
        />
      }
    >
      <View style={styles.form}>
        {add.error && !hasFieldErrors(add.error) ? (
          <Notice tone="destructive" testID="request-problem">
            {errorText(t, add.error)}
          </Notice>
        ) : null}
        {student ? (
          <View style={styles.search}>
            <View
              style={[styles.picked, { borderColor: colors.input, backgroundColor: colors.card }]}
              testID="request-student"
            >
              <Text style={styles.fill} numberOfLines={1}>
                {student.fullName}
              </Text>
              <Button
                compact
                variant="ghost"
                label={t("common.remove")}
                onPress={() => setStudent(null)}
                testID="request-student-remove"
              />
            </View>
            <Text variant="small" tone="mutedForeground" testID="request-balance">
              {t("coins.report.balance", { count: student.balance })}
            </Text>
            {fieldError("studentId") ? (
              <Text variant="small" tone="destructive">
                {fieldError("studentId")}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.search}>
            <Field
              label={tr("student")}
              value={typed}
              onChangeText={setTyped}
              placeholder={t("reports.filters.searchStudent")}
              autoCorrect={false}
              error={fieldError("studentId") ?? (tried ? t("validation.required") : null)}
              testID="request-student-search"
            />
            {typed.trim().length >= 2 && found.data ? (
              found.data.length === 0 ? (
                <Text variant="small" tone="mutedForeground" testID="request-student-none">
                  {t("common.nothingFound")}
                </Text>
              ) : (
                <View style={[styles.results, { borderColor: colors.border }]}>
                  {found.data.map((s, index) => (
                    <View key={s.id}>
                      {index > 0 ? <Divider /> : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setStudent(s);
                          setTyped("");
                        }}
                        style={styles.result}
                        testID={`request-student-${s.id}`}
                      >
                        <View style={styles.fill}>
                          <Text numberOfLines={1}>{s.fullName}</Text>
                          {s.phone ? (
                            <Text variant="small" tone="mutedForeground">
                              {s.phone}
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="bodyStrong">{s.balance}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )
            ) : null}
          </View>
        )}
        <Select
          label={tr("product")}
          value={productId}
          onChange={(value) => setProduct(value ?? productId)}
          placeholder={tr("pickProduct")}
          options={products.map((p) => ({
            value: p.id,
            label: p.name,
            note: String(p.priceCoins),
          }))}
          error={
            fieldError("productId") ??
            (tooDear
              ? t("validation.notEnoughCoins")
              : tried && !productId
                ? t("validation.required")
                : null)
          }
          testID="request-product"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[3] },
  pair: { flexDirection: "row", gap: space[3] },
  noPicture: { alignItems: "center", justifyContent: "center" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: 48,
  },
  remove: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.3 },
  picture: { flexDirection: "row", alignItems: "center", gap: space[3] },
  pictureButtons: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  search: { gap: space[2] },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: space[3],
  },
  results: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: 48,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
