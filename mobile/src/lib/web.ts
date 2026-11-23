import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";

import { api, API_ORIGIN } from "./api";

/*
 * Pages the app does not have yet (the lesson room, the office's tables) open
 * on the site, already signed in (A-204): the app asks the server for a
 * one-minute link and hands it to the phone's browser.
 */
export async function openOnSite(path: string): Promise<void> {
  const { path: link } = await api<{ path: string }>("/auth/web-handoff", {
    method: "POST",
    body: { to: path },
  });
  const url = `${API_ORIGIN}${link}`;
  if (Platform.OS === "web") {
    // In a browser the "app" is a page itself: the site opens in a new tab.
    await Linking.openURL(url);
    return;
  }
  // The system browser, not a web view inside the app: it has the camera and
  // microphone permissions a lesson room needs, and its own address bar.
  await WebBrowser.openBrowserAsync(url, { enableBarCollapsing: true });
}
