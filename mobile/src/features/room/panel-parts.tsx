import type { ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, type TextInputProps } from "react-native";

import { Text } from "@/components/text";
import { font, radius, space } from "@/lib/theme";

import { room } from "./look";

/* The small pieces the teacher's panels share: a choice chip, a wide button, a text field. */

/** One of a few choices in a row; the chosen one is lit. */
export function Chip({
  label,
  chosen = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  chosen?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: chosen }}
      style={({ pressed }) => [styles.chip, chosen && styles.chipChosen, pressed && styles.pressed]}
      testID={testID}
    >
      <Text variant="smallStrong" style={chosen ? styles.activeInk : styles.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A full-width button of a panel: the one thing to do ("main") or a quieter one. */
export function PanelButton({
  label,
  onPress,
  tone = "plain",
  disabled = false,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: "main" | "plain";
  disabled?: boolean;
  icon?: ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        tone === "main" && styles.buttonMain,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={testID}
    >
      {icon}
      <Text
        variant="smallStrong"
        style={tone === "main" ? styles.activeInk : styles.ink}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A text field on the room's dark panel. */
export function PanelInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={room.inkMuted}
      {...props}
      style={[styles.input, props.multiline && styles.inputTall, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  ink: { color: room.ink },
  activeInk: { color: room.activeInk },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  chip: {
    minHeight: 40,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: room.surfaceRaised,
  },
  chipChosen: { backgroundColor: room.active },
  button: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
  },
  buttonMain: { backgroundColor: room.active },
  input: {
    minHeight: 44,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    backgroundColor: room.background,
    color: room.ink,
    fontFamily: font.regular,
    fontSize: 15,
  },
  inputTall: { minHeight: 72, textAlignVertical: "top" },
});
