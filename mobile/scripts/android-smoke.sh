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
  # A slow emulator sometimes says that an app "isn't responding" and covers the
  # screen with that question. "Wait" is pressed, and the look goes on.
  wait_button=$(grep -Eo 'resource-id="android:id/aerr_wait"[^>]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' "$OUT/screen.xml" | grep -Eo '[0-9]+' | tr '\n' ' ' || true)
  if [ -n "$wait_button" ]; then
    # shellcheck disable=SC2086
    set -- $wait_button
    adb shell input tap $((($1 + $3) / 2)) $((($2 + $4) / 2)) || true
    echo "Attempt $attempt: pressed Wait on a \"not responding\" question." >&2
    continue
  fi
  # The sign-in button carries the test id "sign-in" (its resource id on Android).
  if grep -Eq 'resource-id="(sign-in|phone)"' "$OUT/screen.xml"; then
    found=1
    break
  fi
done

adb exec-out screencap -p > "$OUT/sign-in.png" || true
# What the app itself said, and any crash: from the whole run, not only its last lines.
{
  adb logcat -d -b crash || true
  adb logcat -d ReactNativeJS:V ReactNative:W AndroidRuntime:E '*:S' || true
} > "$OUT/log.txt" 2>&1

if [ "$found" -ne 1 ]; then
  echo "The sign-in screen did not appear." >&2
  # What was on the screen instead, so the job's log says it without the picture.
  echo "On the screen (package, then its words):" >&2
  grep -Eo 'package="[^"]+"' "$OUT/screen.xml" 2>/dev/null | sort | uniq -c >&2 || true
  grep -Eo ' text="[^"]+"' "$OUT/screen.xml" 2>/dev/null | head -n 30 >&2 || true
  echo "The app's log:" >&2
  tail -n 120 "$OUT/log.txt" >&2 || true
  exit 1
fi
echo "The app started and shows the sign-in screen."
