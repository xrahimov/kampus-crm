import {
  Text as NativeText,
  type TextProps as NativeTextProps,
  type TextStyle,
} from "react-native";

import { font, useTheme, type Colors } from "@/lib/theme";

/*
 * Every text in the app goes through here, so the type scale is one list:
 * Onest in four weights, sizes that step by roughly a fifth, and tight
 * tracking only on the two display sizes.
 */
const VARIANTS = {
  display: { fontFamily: font.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  title: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  // Times and sums: the heavier weight makes a number findable in a row of words.
  figure: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

export interface TextProps extends NativeTextProps {
  variant?: TextVariant;
  /** A colour token; the page's ink by default. */
  tone?: keyof Colors;
}

export function Text({ variant = "body", tone = "foreground", style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <NativeText
      // Android: lines are broken the plain way. Its balanced breaking can break a line when
      // drawing where it did not when measuring, and the last word of a label is then lost
      // ("Turn everyone's microphone" without "off").
      textBreakStrategy="simple"
      {...rest}
      style={[VARIANTS[variant], { color: colors[tone] }, style]}
    />
  );
}
