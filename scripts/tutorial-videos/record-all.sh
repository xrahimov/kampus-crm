#!/usr/bin/env bash
# Records every how-to video in English, Russian and Uzbek in one go.
#
# Each language gets a demo database of its own (made fresh from the seed, so
# no video sees what another one left behind) and a server of its own, and the
# three are recorded side by side. Demo data only: the databases are named
# kampus_videos_<language> next to the one in DATABASE_URL, and are dropped
# when the recording is over.
#
#   npm run build                      # once, if .next is missing or stale
#   scripts/tutorial-videos/record-all.sh [out-dir] [--only=sign-in,groups] [--voice]
#
# With --voice the captions are also read aloud by Azure voices: the key is
# read from AZURE_SPEECH_KEY and AZURE_SPEECH_REGION, or from the file named
# in AZURE_SPEECH_FILE (see voice.ts). All sentences are fetched first, one
# language after the other, which takes about half an hour the first time on
# the free tier and nothing after that.
#
# Needs: the database server of DATABASE_URL running (its role may create
# databases), Playwright's Chromium, and ffmpeg with libx264 (on the PATH, or
# named in FFMPEG_PATH). Takes about an hour on a laptop.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="tutorial-videos"
ONLY=""
VOICE=""
for arg in "$@"; do
  case "$arg" in
    --only=*) ONLY="$arg" ;;
    --voice) VOICE="--voice" ;;
    *) OUT="$arg" ;;
  esac
done
mkdir -p "$OUT"

if [ ! -d .next ]; then
  echo "No build found: run 'npm run build' first." >&2
  exit 1
fi

BASE_URL="$(node -e 'require("dotenv/config"); process.stdout.write(process.env.DATABASE_URL ?? "")')"
if [ -z "$BASE_URL" ]; then
  echo "DATABASE_URL is not set (.env)." >&2
  exit 1
fi
database_url() {
  node -e 'const u = new URL(process.argv[1]); u.pathname = "/kampus_videos_" + process.argv[2]; process.stdout.write(u.href)' "$BASE_URL" "$1"
}
drop() {
  DATABASE_URL="$BASE_URL" node -e '
    const { Client } = require("pg");
    (async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL.split("?")[0] });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS "kampus_videos_${process.argv[1]}" WITH (FORCE)`);
      await client.end();
    })().catch((error) => { console.error(error.message); process.exit(1); });
  ' "$1"
}

LOCALES=(en ru uz)
if [ -n "$VOICE" ]; then
  echo "Fetching the voice of every caption (kept in $OUT/voice)"
  npx tsx scripts/tutorial-videos/index.ts "${LOCALES[@]}" "--out=$OUT" --voice-only ${ONLY:+"$ONLY"}
fi
SERVERS=()
stop_servers() {
  for pid in "${SERVERS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap stop_servers EXIT

port=3101
RECORDERS=()
for locale in "${LOCALES[@]}"; do
  url="$(database_url "$locale")"
  app="http://localhost:$port"
  echo "[$locale] fresh demo database, server on $app"
  drop "$locale"
  DATABASE_URL="$url" npx prisma migrate deploy > "$OUT/$locale-setup.log" 2>&1
  DATABASE_URL="$url" npx tsx prisma/seed.ts >> "$OUT/$locale-setup.log" 2>&1
  # The stand-in for Telegram (the code is the last six digits of the phone) exists for demo runs only.
  DATABASE_URL="$url" APP_URL="$app" PORT="$port" TELEGRAM_LOGIN_FAKE=1 \
    node node_modules/next/dist/bin/next start > "$OUT/$locale-server.log" 2>&1 &
  SERVERS+=("$!")
  until curl -s -o /dev/null "$app/api/v1/health"; do sleep 1; done
  DATABASE_URL="$url" APP_URL="$app" \
    npx tsx scripts/tutorial-videos/index.ts "$locale" "--out=$OUT" ${ONLY:+"$ONLY"} ${VOICE:+"$VOICE"} \
    > "$OUT/$locale.log" 2>&1 &
  RECORDERS+=("$!")
  port=$((port + 1))
done

failed=0
for i in "${!LOCALES[@]}"; do
  if wait "${RECORDERS[$i]}"; then
    echo "[${LOCALES[$i]}] done"
  else
    echo "[${LOCALES[$i]}] some videos were skipped: see $OUT/${LOCALES[$i]}.log"
    failed=1
  fi
done

stop_servers
sleep 2
for locale in "${LOCALES[@]}"; do drop "$locale" || true; done
cat "$OUT"/en.log "$OUT"/ru.log "$OUT"/uz.log
exit "$failed"
