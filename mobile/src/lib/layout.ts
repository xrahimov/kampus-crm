import { useWindowDimensions } from "react-native";

import { TABLET_MIN_WIDTH } from "./theme";

/**
 * Phone or tablet, by the width the app has right now. An iPad in Split View
 * or a folded-out phone changes its answer as the window changes, so screens
 * ask on every render instead of deciding once.
 */
export function useLayout(): { wide: boolean; width: number; height: number; columns: 1 | 2 } {
  const { width, height } = useWindowDimensions();
  const wide = width >= TABLET_MIN_WIDTH;
  return { wide, width, height, columns: wide ? 2 : 1 };
}
