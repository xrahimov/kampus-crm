#!/usr/bin/env bash
# What Google Play checks first on an upload, checked before it is uploaded
# (A-268): the bundle is signed, and with the upload key it was meant to be
# signed with, not the template's test key; its native libraries are ready for
# 16 KB memory pages.
#
#   check-play-bundle.sh <bundle.aab> <keystore> <alias>
# The keystore's password is read from KAMPUS_UPLOAD_STORE_PASSWORD.
set -euo pipefail

AAB="$1"
STORE="$2"
ALIAS="${3:-upload}"
HERE="$(cd "$(dirname "$0")" && pwd)"

fingerprint() { grep -m1 'SHA256:' | sed 's/.*SHA256: *//' | tr -d '[:space:]'; }

jarsigner -verify "$AAB" >/dev/null
signed_with="$(keytool -printcert -jarfile "$AAB" | fingerprint)"
wanted="$(keytool -list -v -keystore "$STORE" -alias "$ALIAS" \
  -storepass:env KAMPUS_UPLOAD_STORE_PASSWORD | fingerprint)"
if [ -z "$signed_with" ] || [ "$signed_with" != "$wanted" ]; then
  echo "The bundle is not signed with the upload key." >&2
  echo "  signed with: ${signed_with:-nothing}" >&2
  echo "  upload key:  ${wanted:-unreadable}" >&2
  exit 1
fi
echo "Signed with the upload key (certificate SHA-256 $signed_with)."

bash "$HERE/check-page-size.sh" "$AAB"
