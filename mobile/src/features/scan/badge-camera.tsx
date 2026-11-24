import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, CameraOff, ScanLine } from "lucide-react-native";
import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * The camera that reads student badges (A-264). It stays off until the person
 * starts it, asks for the camera the first time, and hands every QR code it
 * sees to `onCode`; the caller decides what to do with a badge seen twice.
 */
export function BadgeCamera({ onCode }: { onCode: (code: string) => void }) {
  const t = useTranslations();
  const ts = useTranslations("today.scan");
  const { colors } = useTheme();
  const [permission, request] = useCameraPermissions();
  const [state, setState] = useState<"off" | "on" | "denied" | "failed">("off");
  /** A refusal the device will not ask about again: only its settings change it. */
  const [final, setFinal] = useState(false);

  const start = async () => {
    try {
      const now = permission?.granted ? permission : await request();
      setFinal(!now.granted && !now.canAskAgain);
      setState(now.granted ? "on" : "denied");
    } catch {
      setState("failed");
    }
  };
  const settings = state === "denied" && final && Platform.OS !== "web";

  return (
    <Card testID="scan-camera-card">
      <View style={styles.head}>
        <Camera size={18} color={colors.mutedForeground} />
        <Text variant="heading">{ts("camera")}</Text>
      </View>
      <View style={styles.frame}>
        {state === "on" ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => onCode(data)}
              onMountError={() => setState("failed")}
              testID="scan-camera"
            />
            <View pointerEvents="none" style={styles.aim} />
          </>
        ) : (
          <ScanLine size={40} strokeWidth={1.25} color="rgba(255,255,255,0.7)" />
        )}
      </View>
      {state === "denied" ? (
        <Notice tone="destructive" testID="scan-denied">
          {t("mobile.scan.denied")}
        </Notice>
      ) : null}
      {state === "failed" ? (
        <Notice tone="warning" testID="scan-no-camera">
          {t("mobile.scan.noCamera")}
        </Notice>
      ) : null}
      <View style={styles.actions}>
        {state === "on" ? (
          <Button
            variant="outline"
            label={ts("stop")}
            icon={<CameraOff size={16} color={colors.foreground} />}
            onPress={() => setState("off")}
            testID="scan-stop"
          />
        ) : (
          <Button
            label={ts("start")}
            icon={<Camera size={16} color={colors.primaryForeground} />}
            onPress={() => void start()}
            testID="scan-start"
          />
        )}
        {settings ? (
          <Button
            variant="outline"
            label={t("mobile.room.openSettings")}
            onPress={() => void Linking.openSettings()}
            testID="scan-settings"
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space[2] },
  frame: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
  },
  aim: {
    position: "absolute",
    top: space[6],
    right: space[6],
    bottom: space[6],
    left: space[6],
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: radius.md,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
