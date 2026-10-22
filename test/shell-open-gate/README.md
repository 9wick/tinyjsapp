# shell.open from a wrapped site

`tinyjs wrap` gives the wrapped origin the `"wrapper"` preset, which grants
`shell.open`. Without a target check that is ShellExecuteW / NSWorkspace /
xdg-open on anything: a program the site just downloaded, or a hostile URL
scheme. A page the app didn't ship may now open only http(s) and mailto
links (`shellOpenAllowed` in runtime/bridge.js).

Headless, every platform: `bin/tjs run test/shell-open-gate/check.js` → `PASS`.

As a hostile page sees it (`site.html` tries a local path, a file:// URL and
an unknown scheme — none of them exist, so nothing opens either way):

1. In this folder: `python3 -m http.server 8766 --bind 127.0.0.1`
2. A scratch app whose tinyjs.json is what `wrap` writes for that origin:
   ```json
   { "name": "shellgate", "id": "test.tinyjs.shellgate",
     "url": "http://127.0.0.1:8766/site.html",
     "api": { "disable": ["*"], "enable": ["win.close"],
              "origins": { "http://127.0.0.1:8766": "wrapper" } } }
   ```
   and a backend that quits after a few seconds:
   `export function init(app) { setTimeout(() => app.quit(), 8000); }`
3. `tinyjs dev` there, then read `"shellgate"` from the app's store.json
   (macOS: `~/Library/Application Support/test.tinyjs.shellgate/`).

Expected: every target reads `shell.open: a page from http://127.0.0.1:8766
may only open http(s) and mailto links`. Before the fix they read the OS's
own refusal ("no such file", "no application registered…"), i.e. the call
reached the OS.
