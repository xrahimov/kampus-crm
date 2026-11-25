import { Platform, StyleSheet, View } from "react-native";

import { Text, type TextProps } from "./text";

/**
 * A short text that is as wide as its words and still shows all of them on
 * Android (A-268). Android lays a text out a fraction of a point narrower than
 * it was measured, so a text given exactly its own width drops its last letter
 * or word to a second line nobody sees ("Arxiv" read "Arxi", "100%, 1 yozuv"
 * read "100%, 1"). The unseen copy, one space longer and held to one line, sets
 * the width; the words are drawn over it. For one line of text beside something
 * that takes the rest of the row; elsewhere it is a plain `Text`.
 */
export function RoomyText({ children, style, ...rest }: TextProps & { children: string }) {
  if (Platform.OS !== "android") {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }
  return (
    <View>
      <Text
        {...rest}
        numberOfLines={1}
        style={[style, styles.unseen]}
        importantForAccessibility="no"
      >
        {`${children} `}
      </Text>
      <Text {...rest} style={[style, StyleSheet.absoluteFill]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  unseen: { opacity: 0 },
});
