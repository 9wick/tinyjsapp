# Windowless tray lifecycle (`"mainWindow": false`)

Requires a logged-in macOS or Linux GUI session and this checkout's rebuilt
launcher (`tinyjs dev` rebuilds it on Linux by itself):

```sh
./setup.sh
cd test/windowless-tray
TINYJS_WINDOWLESS_TEST=1 ../../tinyjs dev
```

The fixture deliberately has **no index.html**. The timed run prints:

- `BOOT []` and a non-null tray rectangle.
- `MENU` with the real native Open editor item present and enabled.
- `PAGE` twice, proving the on-demand window's JS bridge and persistent store.
- `WINDOW_CLOSED editor`, `CLOSED []`, then `CLOSED_AGAIN []`.

It opens/closes the editor twice and quits after 41 seconds. Before the first
open there must be no WebKit processes owned by this launcher. WebKit may
cache worker processes after a window closes; an empty window list is not a
claim that those processes have already exited.

Packaged path:

```sh
../../tinyjs build
TINYJS_WINDOWLESS_TEST=1 './dist/Windowless Tray Test.app/Contents/MacOS/windowless-tray-test'
```

For real JavaScript confirm/prompt callbacks on the named window's native
UIDelegate (the library's main-window delegate was never created):

```sh
TINYJS_WINDOWLESS_TEST=dialogs TINYJS_TEST_AUTODLG=ok ../../tinyjs dev
```

Each page must report `confirm: true` and `prompt: "value"`. The existing
native dialog test hook presses the real default button. For the file-input
callback, manually pick/cancel through the page's `<input type=file>`.

For manual tray callbacks, run without `TINYJS_WINDOWLESS_TEST`, click the real
menu's Open editor / Close editor / Quit actions. Opening/closing windows
must not remove the icon or terminate the backend. The page's Close button
must destroy only that named window.

Also check a scratch app containing only `src/main.js` and `tinyjs.json`
(no frontend directory at all): `"mainWindow": false` must build and start.
A regular app without the flag must still report `["main"]` and load its
initial page. A non-boolean `mainWindow` must fail, and so must
`"mainWindow": false` together with `"url"`.

Linux packaged path: `../../tinyjs build`, then
`TINYJS_WINDOWLESS_TEST=1 ./dist/windowless-tray-test`. The tray rectangle
prints `null` there (an AppIndicator has no readable geometry). Before the
first open, `pgrep -P <launcher pid>` must show no WebKit processes.

## Windows

Not implemented yet: there the main window still exists, hidden (as with
`"activation": "accessory"`), and the CLI prints a notice. The same
timed run should therefore print `BOOT ["main"]` (not `[]`), still show the
tray, open/close the editor twice and quit — no `index.html` needed, the
hidden main window gets a blank page. The memory saving is macOS/Linux-only.
