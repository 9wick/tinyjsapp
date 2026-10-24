# tiny.capabilities

Headless, any OS: `bin/tjs run test/capabilities/check.js` → `capabilities: all ok`.

As a wrapped site sees it:

1. In this folder: `python3 -m http.server 8768 --bind 127.0.0.1`
2. `cd app && tinyjs dev` — the main window is `site.html` from that server
   (the "wrapper" preset, plus `report`); the backend opens the app's own
   `own.html` too. Each page stores what `tiny.capabilities` told it, and
   the app quits.

`store.json` → `"capabilities"`: `own` has every path ok (`count` = all of
them, give or take what the OS lacks); `site` has fewer, with
`clipboard.read`, `fetch`, `proxyURL`, `win.onDrop`, `app.onOpenUrl`,
`macos.ai.generate` and `app.secrets.get` as `{ ok: false, why: 'gate',
needs: [...] }`, and `notify`, `clipboard.write`, `menu.on` ok. In both,
`before` is false (asked before `ready`) and `fired` equals `count` (the
first snapshot fires onChange).
