import { X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";

import { Glass, NoBackdrop } from "./glass";
import { Animated, Press, SPRING_FIRM } from "./motion";
import { Text } from "./text";

const OUT_MS = 180;

/**
 * Something asked over the page: a list to pick from, a short form, a
 * question. On a phone it is a sheet of glass that slides up from the bottom
 * edge; on a tablet a pane in the middle. The page behind dims, and a press
 * on it, the cross or Android's back button closes the sheet.
 *
 * The content scrolls when it is taller than the sheet; `footer` stays under
 * it (the button that saves).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  testID = "sheet",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const { wide, height } = useLayout();
  const insets = useSafeAreaInsets();
  // The window stays until the sheet has slid away.
  const [mounted, setMounted] = useState(open);
  const shown = useSharedValue(0);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      shown.set(withSpring(1, SPRING_FIRM));
      return undefined;
    }
    shown.set(withTiming(0, { duration: OUT_MS }));
    const gone = setTimeout(() => setMounted(false), OUT_MS);
    return () => clearTimeout(gone);
  }, [open, shown]);
  const dim = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const rise = useAnimatedStyle(() =>
    wide
      ? { opacity: shown.get(), transform: [{ scale: 0.96 + 0.04 * shown.get() }] }
      : { transform: [{ translateY: (1 - shown.get()) * height * 0.6 }] },
  );
  if (!mounted) return null;
  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <NoBackdrop>
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <View style={[styles.fill, wide ? styles.middle : styles.bottom]}>
            <Animated.View style={[StyleSheet.absoluteFill, dim]}>
              <Pressable
                accessibilityLabel={t("common.close")}
                onPress={onClose}
                style={[styles.fill, { backgroundColor: colors.scrim }]}
                testID={`${testID}-scrim`}
              />
            </Animated.View>
            <Animated.View
              accessibilityViewIsModal
              style={[
                wide ? styles.pane : styles.sheet,
                { maxHeight: height * (wide ? 0.8 : 0.86) },
                rise,
              ]}
              testID={testID}
            >
              <Glass floating radius={radius.xl} style={[styles.glass, !wide && styles.joined]}>
                <View style={styles.head}>
                  <Text variant="heading" style={styles.title} accessibilityRole="header">
                    {title}
                  </Text>
                  <Press
                    accessibilityRole="button"
                    accessibilityLabel={t("common.close")}
                    onPress={onClose}
                    hitSlop={10}
                    sink={0.88}
                    style={[styles.close, { backgroundColor: colors.secondary }]}
                    testID={`${testID}-close`}
                  >
                    <X size={18} color={colors.foreground} />
                  </Press>
                </View>
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={[
                    styles.content,
                    !footer && { paddingBottom: space[4] + (wide ? 0 : insets.bottom) },
                  ]}
                  keyboardShouldPersistTaps="handled"
                >
                  {children}
                </ScrollView>
                {footer ? (
                  <View
                    style={[
                      styles.footer,
                      { borderTopColor: colors.border },
                      { paddingBottom: space[3] + (wide ? 0 : insets.bottom) },
                    ]}
                  >
                    {footer}
                  </View>
                ) : null}
              </Glass>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </NoBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { justifyContent: "flex-end" },
  middle: { justifyContent: "center", alignItems: "center", padding: space[8] },
  sheet: { width: "100%" },
  pane: { width: "100%", maxWidth: 520 },
  glass: { flexShrink: 1, overflow: Platform.OS === "android" ? "hidden" : "visible" },
  // On a phone the sheet stands on the bottom edge: only its top corners are round.
  joined: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[3],
  },
  title: { flex: 1 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flexShrink: 1 },
  content: { paddingHorizontal: space[4], gap: space[3] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
});
