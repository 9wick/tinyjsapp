# media-dev — dev-mode `navigator.mediaDevices` exposure (#96/#97)

Checks that `tinyjs dev` on macOS 26+ exposes `navigator.mediaDevices`
(tarwin/tinyjsapp#96): WebKit hides the whole API unless its
`MediaDevicesEnabled` preference is on, and the macOS default for that
needs a TCC grant or a bundle usage string — dev mode has neither, because
the bridge spawns the launcher through a title-named symlink, so WebKit
never sees an Info.plist. The fix (#97) flips the private
`_setMediaDevicesEnabled:` SPI in dev/spawn mode only.

`page.html` is self-driving and single-file:

- waits for `tiny`, then records `md_main` = `{ mediaDevices: typeof
  navigator.mediaDevices, secure, gum }` in `tiny.store`
- attempts `getUserMedia({ audio: true })` when the API is there — the
  first run pops the TCC microphone prompt (this is the part no script
  can click; watch it by hand)
- opens a `second` window on the same page, which records `md_second`
  the same way (secondary windows take the launcher's own
  `WKWebViewConfiguration` path, not the webview library's)

Run from any app dir. For the full check (both windows), make the page
the app's frontend and run plain dev — a `TINYJS_HTML` run materializes
only the main page, so a `second` window would load the app's real
frontend instead of this page:

```
cp page.html <app>/src/frontend/index.html && tinyjs dev
```

A main-window-only quick check works without touching the app:

```
TINYJS_HTML=<repo>/test/media-dev/page.html tinyjs dev
```

Read the results from the app's store (`~/Library/Application
Support/<app-id>/store.json` on macOS), keys `md_main` / `md_second`:

- fixed launcher: `mediaDevices: "object"` in both, `gum: "granted: …"`
  after the TCC allow (first run only)
- pre-fix launcher: `"undefined"` in both, `gum: "skipped"`

Needs a GUI session and, for the `gum` half, a person to answer the TCC
prompt once; A/B launchers with `TINYJS_LAUNCHER`. Windows/Linux are
unaffected by the gate and should read `"object"` unchanged.
