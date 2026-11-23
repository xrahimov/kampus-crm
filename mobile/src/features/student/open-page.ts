import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";

import { API_ORIGIN } from "@/lib/api";

/**
 * The student's personal page on the site (/class/<token>): where homework is
 * answered, tests are taken and the online lesson is joined, until the app has
 * those itself. The link is its own key, so nothing needs signing in.
 */
export async function openPersonalPage(locale: string, token: string): Promise<void> {
  const url = `${API_ORIGIN}/${locale}/class/${encodeURIComponent(token)}`;
  if (Platform.OS === "web") await Linking.openURL(url);
  else await WebBrowser.openBrowserAsync(url, { enableBarCollapsing: true });
}
