#!/bin/bash
# drag-race regression: A/B-able startDrag race test. Self-judging: exits 0
# only if every case both fired (store asserts) and moved as expected.
# Fails by design on launchers without the #92 fix. Run by hand (needs a
# GUI session); pass TINYJS_LAUNCHER=/path/to/launcher to pick the binary
# under test.
set -u -o pipefail
P=; DEV=
trap 'kill ${P:-} ${DEV:-} 2>/dev/null || true' EXIT INT TERM
DIR="$(cd "$(dirname "$0")" && pwd)"
ID=$(python3 -c "import json;print(json.load(open('$DIR/app/tinyjs.json'))['id'])")
STORE="$HOME/Library/Application Support/$ID/store.json"
pgrep -x dragrace >/dev/null && { echo "dragrace already running"; exit 1; }
rm -f "$STORE"   # fresh store: asserted below
cd "$DIR/app" || exit 9
tinyjs dev > "$DIR/dev.log" 2>&1 &
DEV=$!
for _ in $(seq 1 20); do
  sleep 1
  P=$(pgrep -x dragrace | head -1) && [ -n "$P" ] && break
done
[ -n "${P:-}" ] || { echo "FAIL: window never appeared"; tail -5 "$DIR/dev.log"; kill $DEV 2>/dev/null; exit 1; }
sleep 3
# pipefail + explicit check: a driver abort (prints {"error":...}, exit 1)
# must fail loudly, not surface as a misdirecting pixel-assert failure.
swift "$DIR/driver.swift" "$P" | tee "$DIR/result.json" || {
  echo "FAIL: driver aborted"; cat "$DIR/result.json"; exit 1;
}
kill "$P" $DEV 2>/dev/null

sleep 1   # let the backend flush the store before it dies
FAIL=0
# 1. Every synthetic click landed on the right element (else a case ran
#    vacuously — the driver's pixel offsets alone cannot prove this).
python3 - "$STORE" <<'EOF' || FAIL=1
import json, sys
s = json.load(open(sys.argv[1]))
want = {'plain': 'pressed', 'poison': 'fired', 'nobtn': 'called'}
for k, v in want.items():
    got = s.get(k, '')
    print(f"{k} handler: {got!r}")
    assert got == v, f"{k}: expected {v!r}, got {got!r} — click missed its element"
EOF
# 2. The movements themselves (px of window travel).
python3 - "$DIR/result.json" <<'EOF' || FAIL=1
import json, sys
r = json.load(open(sys.argv[1]))
for k, v in r.items(): print(f"{k}: {v}")
assert r.get('plain_dx', 0) >= 100, "plain data-tiny-drag no longer engages"
assert r.get('poison_dx', 0) >= 100, "poisoned-currentEvent drag did not engage (the #92 race)"
assert abs(r.get('nobtn_dx', 0)) < 10, "startDrag with no button held moved the window"
assert r.get('alive_dx', 0) <= -50, "app not responsive after the cases (or moved the wrong way)"
EOF
[ $FAIL -eq 0 ] && echo "PASS" || echo "FAIL"
exit $FAIL
