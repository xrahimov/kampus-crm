#!/usr/bin/env bash
# Google Play takes an app that targets Android 15 or later only when its
# native libraries work with 16 KB memory pages (A-268). Looks into an app file
# (.apk or .aab) and fails when a 64-bit library's loadable parts are aligned to
# less than 16 KB, naming each one.
set -euo pipefail

FILE="$1"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

unzip -q -o "$FILE" 'lib/arm64-v8a/*.so' 'lib/x86_64/*.so' \
  'base/lib/arm64-v8a/*.so' 'base/lib/x86_64/*.so' -d "$WORK" 2>/dev/null || true

count=0
bad=0
while IFS= read -r -d '' lib; do
  count=$((count + 1))
  # Each LOAD line of the program headers ends with the alignment, in hex.
  smallest="$(readelf -lW "$lib" | awk '$1 == "LOAD" { print $NF }' | while read -r align; do
    echo $((align))
  done | sort -n | head -1)"
  if [ -z "$smallest" ] || [ "$smallest" -lt 16384 ]; then
    bad=$((bad + 1))
    echo "NOT 16 KB: ${lib#"$WORK"/} (aligned to ${smallest:-?} bytes)"
  fi
done < <(find "$WORK" -name '*.so' -print0)

if [ "$count" -eq 0 ]; then
  echo "No 64-bit native libraries found in $FILE" >&2
  exit 1
fi
echo "$count 64-bit native libraries looked at, $bad not ready for 16 KB pages."
[ "$bad" -eq 0 ]
