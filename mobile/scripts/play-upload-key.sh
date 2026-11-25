#!/usr/bin/env bash
# Makes the key that signs what is uploaded to Google Play (A-268), once, on
# kai's Mac, and hands it to GitHub so that the "Google Play bundle" workflow
# can sign with it. Run it yourself in Terminal:
#
#   bash mobile/scripts/play-upload-key.sh
#
# What it does:
#   1. makes a random password and keeps it in the Mac's Keychain
#      (item "kampus-upload-key"); it is never shown on the screen;
#   2. makes the key file ~/Desktop/Private/kampus-upload-key.jks;
#   3. puts the file and the password into this repository's GitHub secrets
#      (ANDROID_UPLOAD_KEYSTORE, ANDROID_UPLOAD_PASSWORD) with `gh`.
#
# Run again, it makes nothing new: it sends the existing key to GitHub again.
# Keep the key file and the Keychain item. If both are ever lost, Google can
# register a new upload key (Play Console → Setup → App signing), so the app is
# not lost with them; it only takes a day or two.
set -euo pipefail

REPO="${KAMPUS_REPO:-xrahimov/kampus-crm}"
KEY_DIR="${KAMPUS_KEY_DIR:-$HOME/Desktop/Private}"
KEY="$KEY_DIR/kampus-upload-key.jks"
ITEM="kampus-upload-key"

find_tool() {
  local name="$1"
  shift
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  command -v "$name" || {
    echo "Cannot find $name on this computer." >&2
    exit 1
  }
}
KEYTOOL="$(find_tool keytool "$HOME/.local/jdk-17/Contents/Home/bin/keytool" "$HOME/.local/jdk-17/bin/keytool")"
GH="$(find_tool gh "$HOME/.local/bin/gh")"

"$GH" auth status >/dev/null 2>&1 || {
  echo "gh is not signed in to GitHub. Run: $GH auth login" >&2
  exit 1
}

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

if [ -f "$KEY" ]; then
  echo "The key file is already there; sending the same key to GitHub again."
  KAMPUS_KEY_PASSWORD="$(security find-generic-password -a "$USER" -s "$ITEM" -w)"
else
  KAMPUS_KEY_PASSWORD="$(openssl rand -hex 24)"
  security add-generic-password -a "$USER" -s "$ITEM" -w "$KAMPUS_KEY_PASSWORD" -U
  export KAMPUS_KEY_PASSWORD
  "$KEYTOOL" -genkeypair -keystore "$KEY" -storetype PKCS12 -alias upload \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Kampus, O=Kampus, C=UZ" \
    -storepass:env KAMPUS_KEY_PASSWORD -keypass:env KAMPUS_KEY_PASSWORD
  chmod 600 "$KEY"
  echo "Made $KEY"
fi
export KAMPUS_KEY_PASSWORD

# The key opens with the password, or nothing is sent anywhere.
"$KEYTOOL" -list -keystore "$KEY" -alias upload -storepass:env KAMPUS_KEY_PASSWORD >/dev/null

base64 < "$KEY" | tr -d '\n' | "$GH" secret set ANDROID_UPLOAD_KEYSTORE --repo "$REPO"
printf '%s' "$KAMPUS_KEY_PASSWORD" | "$GH" secret set ANDROID_UPLOAD_PASSWORD --repo "$REPO"

echo "The key's certificate (public, safe to show):"
"$KEYTOOL" -list -v -keystore "$KEY" -alias upload -storepass:env KAMPUS_KEY_PASSWORD |
  grep -m1 'SHA256:' | sed 's/^ *//'
echo "UPLOAD_KEY_DONE"
