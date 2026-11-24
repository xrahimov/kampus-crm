import { useState, type ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";

import {
  RECEIPT_FIELDS,
  useReceiptSettings,
  useSaveReceipt,
  type LogoPosition,
  type ReceiptField,
  type ReceiptSettings,
} from "@/api/office-settings";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { fileSource } from "@/features/room/file-source";
import { PendingScreen } from "@/features/shared/pending-screen";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space } from "@/lib/theme";

/**
 * Receipt settings (A-242): the site's Settings → Receipt settings. What the
 * printed payment receipt shows: the centre's address and phone, which parts
 * are on it, where the logo goes and the words at the foot, with a sample of
 * the receipt that follows each choice.
 */
export function ReceiptScreen() {
  const tr = useTranslations("settings.receipt");
  const query = useReceiptSettings();
  const header = <Header back title={tr("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  return <ReceiptForm settings={query.data} header={header} />;
}

function ReceiptForm({ settings, header }: { settings: ReceiptSettings; header: ReactNode }) {
  const t = useTranslations();
  const tr = useTranslations("settings.receipt");
  const { wide } = useLayout();
  const save = useSaveReceipt();
  const [address, setAddress] = useState(settings.address ?? "");
  const [phone, setPhone] = useState(settings.phone ?? "");
  const [visible, setVisible] = useState<ReceiptField[]>(settings.visibleFields);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(settings.logoPosition);
  const [footerText, setFooterText] = useState(settings.footerText ?? "");
  const fieldError = fieldErrorOf(t, save.error);
  const show = (field: ReceiptField) => visible.includes(field);
  // Any change after a save takes the "Saved." away: it is no longer true of what is shown.
  const touch = () => {
    if (save.isSuccess || save.error) save.reset();
  };

  const submit = () =>
    save.mutate({
      address: address.trim() || null,
      phone: phone.trim() || null,
      // In the order the receipt has them, whatever order they were ticked in.
      visibleFields: RECEIPT_FIELDS.filter(show),
      logoPosition,
      footerText: footerText.trim() || null,
    });

  const form = (
    <Card testID="receipt-form">
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      {save.error && !hasFieldErrors(save.error) ? (
        <Notice tone="destructive" testID="receipt-problem">
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      <Field
        label={tr("address")}
        value={address}
        onChangeText={(next) => {
          touch();
          setAddress(next);
        }}
        maxLength={200}
        error={fieldError("address")}
        testID="receipt-address"
      />
      <Field
        label={tr("phone")}
        value={phone}
        onChangeText={(next) => {
          touch();
          setPhone(next);
        }}
        maxLength={40}
        keyboardType="phone-pad"
        error={fieldError("phone")}
        testID="receipt-phone"
      />
      <View style={styles.tight}>
        <Text variant="smallStrong">{tr("visibleFields")}</Text>
        <View style={styles.grid}>
          {RECEIPT_FIELDS.map((field) => (
            <View key={field} style={wide ? styles.half : styles.full}>
              <Check
                label={tr(`fields.${field}`)}
                value={show(field)}
                onChange={(on) => {
                  touch();
                  setVisible((now) => (on ? [...now, field] : now.filter((f) => f !== field)));
                }}
                testID={`receipt-field-${field}`}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.tight}>
        <Text variant="smallStrong">{tr("logoPosition")}</Text>
        <Segmented
          options={[
            { value: "TOP", label: tr("TOP") },
            { value: "BOTTOM", label: tr("BOTTOM") },
          ]}
          value={logoPosition}
          onChange={(next) => {
            touch();
            setLogoPosition(next);
          }}
          testID="receipt-logo"
        />
      </View>
      <Field
        label={tr("footerText")}
        value={footerText}
        onChangeText={(next) => {
          touch();
          setFooterText(next);
        }}
        multiline
        maxLength={500}
        error={fieldError("footerText")}
        testID="receipt-footer"
      />
      {save.isSuccess ? (
        <Notice tone="success" testID="receipt-saved">
          {t("common.saved")}
        </Notice>
      ) : null}
      <Button
        label={t("common.save")}
        loading={save.isPending}
        onPress={submit}
        testID="receipt-save"
      />
    </Card>
  );

  const logo =
    show("logo") && settings.logoUrl ? (
      <Image
        source={fileSource(settings.logoUrl)}
        style={styles.logo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    ) : null;
  const sample: Array<[ReceiptField, string, string]> = [
    ["paymentId", t("payments.receipt.paymentId"), "pay_000001"],
    ["student", t("payments.receipt.student"), "Ali Valiyev"],
    ["group", t("payments.receipt.group"), "GE-Morning A1"],
    ["teacher", t("payments.receipt.teacher"), "Jasur Aliyev"],
    ["coursePrice", t("payments.receipt.coursePrice"), "500 000"],
    ["method", t("payments.receipt.method"), t("mobile.settingsPages.sampleMethod")],
    ["paidAt", t("payments.receipt.paidAt"), "03.10.2026"],
    ["cashier", t("payments.receipt.cashier"), "Dilnoza Karimova"],
  ];
  // The receipt is paper: white with black ink in the dark look too.
  const ink = { color: "#111111" } as const;
  const faint = { color: "#555555" } as const;
  const preview = (
    <Card testID="receipt-preview-card">
      <Text variant="heading">{tr("preview")}</Text>
      <View style={styles.paper} testID="receipt-preview">
        {logoPosition === "TOP" ? logo : null}
        {show("header") ? (
          <View style={styles.center}>
            <Text variant="bodyStrong" style={ink}>
              {t("payments.receipt.title")}
            </Text>
            <Text style={ink}>{settings.organizationName}</Text>
            {show("address") && address.trim() ? (
              <Text variant="small" style={ink} testID="receipt-preview-address">
                {address.trim()}
              </Text>
            ) : null}
            {show("phone") && phone.trim() ? (
              <Text variant="small" style={ink}>
                {phone.trim()}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View>
          {sample
            .filter(([field]) => show(field))
            .map(([field, label, value]) => (
              <View key={field} style={styles.line} testID={`receipt-preview-${field}`}>
                <Text variant="small" style={faint}>
                  {label}
                </Text>
                <Text variant="smallStrong" style={[ink, styles.value]}>
                  {value}
                </Text>
              </View>
            ))}
        </View>
        {show("amount") ? (
          <View style={[styles.line, styles.amount]} testID="receipt-preview-amount">
            <Text variant="bodyStrong" style={ink}>
              {t("payments.receipt.amount")}
            </Text>
            <Text variant="bodyStrong" style={ink}>
              500 000
            </Text>
          </View>
        ) : null}
        {show("qr") ? <View style={styles.qr} testID="receipt-preview-qr" /> : null}
        {show("footer") ? (
          <View style={styles.center} testID="receipt-preview-footer">
            <Text variant="small" style={faint}>
              {show("footerText") && footerText.trim()
                ? footerText.trim()
                : t("payments.receipt.thanks")}
            </Text>
            {show("printedAt") ? (
              <Text variant="small" style={faint}>
                {t("payments.receipt.printedAt")}: 03.10.2026 12:00
              </Text>
            ) : null}
          </View>
        ) : null}
        {logoPosition === "BOTTOM" ? logo : null}
      </View>
    </Card>
  );

  return (
    <Screen header={header}>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.main}>{form}</View>
          <View style={styles.side}>{preview}</View>
        </View>
      ) : (
        <>
          {form}
          {preview}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tight: { gap: space[2] },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  full: { width: "100%" },
  half: { width: "50%", paddingRight: space[2] },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  main: { flex: 3 },
  side: { flex: 2 },
  paper: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: radius.md,
    padding: space[4],
    gap: space[3],
  },
  center: { alignItems: "center", gap: 2 },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space[2],
    paddingVertical: space[1],
  },
  value: { flexShrink: 1, textAlign: "right" },
  amount: { borderTopWidth: 1, borderTopColor: "#d4d4d4", paddingTop: space[2] },
  qr: {
    width: 64,
    height: 64,
    alignSelf: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#999999",
    borderRadius: radius.sm,
  },
  logo: { height: 48, width: "100%" },
});
