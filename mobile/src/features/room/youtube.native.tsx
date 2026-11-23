import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

import { API_ORIGIN } from "@/lib/api";

/*
 * A YouTube video in the lesson (A-210). YouTube plays only through its own
 * player, which is a web page, so this one piece is a web view; everyone
 * presses play themselves, as on the site.
 */
export function YouTubePlayer({ id, title }: { id: string; title: string }) {
  // YouTube refuses an embed that does not say where it is shown; the page gets the
  // server's address as its own.
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0"
title="${title.replace(/[<>"&]/g, "")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html, baseUrl: API_ORIGIN || "https://kampus.center" }}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      style={styles.player}
      testID="material-youtube"
    />
  );
}

const styles = StyleSheet.create({
  player: { flex: 1, backgroundColor: "#000000" },
});
