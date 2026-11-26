import { useEffect } from "react";

import { donate, type Donation } from "./native";

/**
 * For a screen the person opened by hand (A-273): the iPhone learns at what
 * hours they join a lesson or look at homework, and offers the matching
 * shortcut on the lock screen and in Spotlight around those hours. Android and
 * a browser learn nothing from it.
 */
export function useDonation(name: Donation, when = true): void {
  useEffect(() => {
    if (when) donate(name);
  }, [name, when]);
}
