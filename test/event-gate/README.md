# Page events and the "api" gate

Headless, any OS: `bin/tjs run test/event-gate/check.js` → `PASS`.

As a wrapped site sees it:

1. In this folder: `python3 -m http.server 8767 --bind 127.0.0.1`
2. `cd app && tinyjs dev` — the main window is `site.html` from that server
   (the "wrapper" preset, plus its two api calls); the backend opens the
   app's own `own.html` too, pushes six events to every window, stores what
   each page heard, and quits.

`store.json` → `"eventgate"` should be
`{"site": ["menu", "theme"], "own": ["menu", "theme", "open-url", "drop", "download", "tick"]}`
(order may vary). Before the fix the site heard all six — including the
open-url "SECRET" and the dropped/downloaded paths.
