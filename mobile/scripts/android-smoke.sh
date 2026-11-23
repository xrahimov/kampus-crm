#!/usr/bin/env bash
# Installs the app file on the running emulator, opens it and waits for the
# sign-in screen. Leaves a picture and the screen's contents in ./smoke.
set -euo pipefail

APK="$1"
OUT="smoke"
mkdir -p "$OUT"

adb install -r "$APK"
adb logcat -c
adb shell monkey -p center.kampus.app -c android.intent.category.LAUNCHER 1 >/dev/null

found=0
for attempt in $(seq 1 40); do
  sleep 3
  adb shell uiautomator dump /sdcard/screen.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/screen.xml "$OUT/screen.xml" >/dev/null 2>&1 || continue
  # The sign-in button carries the test id "sign-in" (its resource id on Android).
  if grep -Eq 'resource-id="(sign-in|phone)"' "$OUT/screen.xml"; then
    found=1
    break
  fi
done

adb exec-out screencap -p > "$OUT/sign-in.png" || true
adb logcat -d -t 400 '*:E' ReactNativeJS:V > "$OUT/log.txt" || true

if [ "$found" -ne 1 ]; then
  echo "The sign-in screen did not appear." >&2
  tail -n 80 "$OUT/log.txt" >&2 || true
  exit 1
fi
echo "The app started and shows the sign-in screen."
