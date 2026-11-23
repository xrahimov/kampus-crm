import { useState, type ComponentRef, type Ref } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { font, radius, space, useTheme } from "@/lib/theme";

import { Text } from "./text";

export interface FieldProps extends TextInputProps {
  label: string;
  /** The field itself, to move the cursor into it. */
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  /** A sentence shown under the field in the destructive colour. */
  error?: string | null;
  hint?: string;
}

/** A labelled text field with its error underneath. */
export function Field({
  label,
  error,
  hint,
  style,
  onFocus,
  onBlur,
  inputRef,
  ...rest
}: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong">{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground}
        {...rest}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : focused ? colors.ring : colors.input,
          },
          focused && styles.focused,
          style,
        ]}
      />
      {error ? (
        <Text variant="small" tone="destructive">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="mutedForeground">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: font.regular,
    fontSize: 16,
  },
  focused: { borderWidth: 2, paddingHorizontal: space[3] - 1 },
});
