#!/bin/sh
# Regenerates docs/docs/api-map.md, the backend `app` vs page `tiny` table.
#
#   scripts/api-map/run.sh
#
# Three steps:
#   1. extract.cjs walks the Tiny / TinyApp interfaces in tiny.d.ts with the
#      TypeScript checker (signatures, docs, @deprecated).
#   2. dump-app runs under `tinyjs dev` and lists what the live `app` and
#      `tiny` objects actually have, so anything undeclared gets flagged.
#      It opens a small window for a couple of seconds and quits itself.
#   3. render.py pairs the two sides and writes docs/docs/api-map.md.
#
# Needs node, python3 and a working `tinyjs` on PATH. Run it after changing
# the API, and read the diff — the hand-written parts (the events table, the
# notes for app.push / app.win.push) live in render.py.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# TypeScript for extract.cjs, installed into the temp dir (not the repo).
(cd "$work" && npm init -y >/dev/null && npm install --silent typescript@5.6.3 >/dev/null)
NODE_PATH="$work/node_modules" node "$here/extract.cjs" \
  "$here/../../template/types/tiny.d.ts" > "$work/dts.json"

# Copy the dump app so `tinyjs dev` writes its .build/ into the temp dir.
cp -R "$here/dump-app" "$work/app"
(cd "$work/app" && DUMP_OUT="$work/runtime.json" tinyjs dev > "$work/dev.log" 2>&1) &
pid=$!
i=0
while [ ! -s "$work/runtime.json" ] && [ $i -lt 60 ]; do
  sleep 1; i=$((i + 1))
done
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
if [ ! -s "$work/runtime.json" ]; then
  echo "api-map: the dump app never reported back — its log:" >&2
  cat "$work/dev.log" >&2
  exit 1
fi

python3 "$here/render.py" "$work/dts.json" "$work/runtime.json"
