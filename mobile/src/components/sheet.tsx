import { X } from "lucide-react-native";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
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
/** How long a sheet waits for iOS to say its window is gone before it goes on without the word. */
const DISMISS_MS = 250;

/*
 * An iPhone or iPad shows one window over a screen at a time. A sheet asked
 * for while another is still on its way out (a form opened from a menu, a
 * question asked from a form) was refused by iOS and never appeared. So the
 * sheets that are leaving are counted, and a sheet that opens waits until
 * none is: the menu slides away, then the form comes. A sheet inside an open
 * sheet (a list to pick from in a form) is over that sheet and does not wait.
 * Android stacks its windows and needs none of this.
 */
const HOLDS = Platform.OS === "ios";
let leaving = 0;
const waiting = new Set<() => void>();

function left() {
  leaving = Math.max(0, leaving - 1);
  if (leaving === 0) for (const go of [...waiting]) go();
}

/** Calls `go` once no sheet is on its way out: right after this render when none is. */
function whenClear(go: () => void): () => void {
  let live = true;
  const run = () => {
    waiting.delete(run);
    if (!live) return;
    live = false;
    go();
  };
  if (leaving === 0) queueMicrotask(run);
  else waiting.add(run);
  return () => {
    live = false;
    waiting.delete(run);
  };
}

/**
 * Where a sheet is: not there, there, sliding away, or slid away with its
 * window still being taken down (iOS).
 */
type Stage = "closed" | "open" | "sliding" | "hiding";

/**
 * Something asked over the page: a list to pick from, a short form, a
 * question. On a phone it is a sheet of glass that slides up from the bottom
 * edge; on a tablet a pane in the middle. The page behind dims, and a press
 * on it, the cross or Android's back button closes the sheet.
 *
 * The content scrolls when it is taller than the sheet; `footer` stays under
 * it (the button that saves). With the keyboard open the sheet takes what is
 * left between the status bar and the keyboard.
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
  const [stage, setStage] = useState<Stage>("closed");
  const shown = useSharedValue(0);
  if (!open && stage === "open") setStage("sliding");
  // Asked for again before it had left: it comes back.
  if (open && stage === "sliding") setStage("open");
  const away = stage === "sliding" || stage === "hiding";
  // Counted before any sheet of the same render decides to open (their effects come later).
  useLayoutEffect(() => {
    if (!away || !HOLDS) return undefined;
    leaving += 1;
    return left;
  }, [away]);
  const wanted = open && stage === "closed";
  useEffect(() => {
    if (!wanted) return undefined;
    return whenClear(() => setStage("open"));
  }, [wanted]);
  useEffect(() => {
    if (stage === "open") {
      shown.set(withSpring(1, SPRING_FIRM));
      return undefined;
    }
    if (stage === "sliding") {
      // The window stays until the sheet has slid away.
      shown.set(withTiming(0, { duration: OUT_MS }));
      const gone = setTimeout(() => setStage(HOLDS ? "hiding" : "closed"), OUT_MS);
      return () => clearTimeout(gone);
    }
    if (stage === "hiding") {
      // iOS says when the window is gone (onDismiss below); this is for when it does not.
      const gone = setTimeout(() => setStage("closed"), DISMISS_MS);
      return () => clearTimeout(gone);
    }
    return undefined;
  }, [stage, shown]);
  const dim = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const rise = useAnimatedStyle(() =>
    wide
      ? { opacity: shown.get(), transform: [{ scale: 0.96 + 0.04 * shown.get() }] }
      : { transform: [{ translateY: (1 - shown.get()) * height * 0.6 }] },
  );
  if (stage === "closed") return null;
  return (
    <Modal
      visible={stage !== "hiding"}
      onDismiss={() => setStage((now) => (now === "hiding" ? "closed" : now))}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <NoBackdrop>
        {/* The dim covers the whole window, also the strip a keyboard takes: it is not inside
            the part that makes room for the keyboard. */}
        <Animated.View style={[StyleSheet.absoluteFill, dim]}>
          <Pressable
            accessibilityLabel={t("common.close")}
            onPress={onClose}
            style={[styles.fill, { backgroundColor: colors.scrim }]}
            testID={`${testID}-scrim`}
          />
        </Animated.View>
        <KeyboardAvoidingView behavior="padding" style={[styles.fill, styles.through]}>
          <View
            style={[
              styles.fill,
              styles.through,
              wide ? styles.middle : styles.bottom,
              // Never under the clock: with the keyboard open the sheet gives up height instead.
              { paddingTop: Math.max(wide ? space[8] : 0, insets.top + space[2]) },
            ]}
          >
            <Animated.View
              accessibilityViewIsModal
              style={[
                wide ? styles.pane : styles.sheet,
                { maxHeight: height * (wide ? 0.8 : 0.86) },
                rise,
              ]}
              testID={testID}
            >
              <Glass
                floating
                dense
                radius={radius.xl}
                style={[styles.glass, !wide && styles.joined]}
              >
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
  // A press beside the sheet goes through to the dim behind, which closes it.
  through: { pointerEvents: "box-none" },
  bottom: { justifyContent: "flex-end" },
  middle: { justifyContent: "center", alignItems: "center", padding: space[8] },
  // Both give up height when the keyboard takes the room: the title and the footer stay on
  // the screen and the fields scroll between them. Without it the sheet kept its height and
  // went off the top (a phone) or off both ends (a tablet on its side).
  sheet: { width: "100%", flexShrink: 1 },
  pane: { width: "100%", maxWidth: 520, flexShrink: 1 },
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
