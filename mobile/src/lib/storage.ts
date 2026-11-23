import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/*
 * Where the session token rests between launches: the phone's keychain
 * (Keychain on iOS, Keystore-backed storage on Android). A browser has no
 * keychain, so the web build keeps it in the browser's own storage.
 */
const onWeb = Platform.OS === "web";

export const secure = {
  async get(key: string): Promise<string | null> {
    try {
      return onWeb ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (onWeb) await AsyncStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    try {
      if (onWeb) await AsyncStorage.removeItem(key);
      else await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing was stored.
    }
  },
};
