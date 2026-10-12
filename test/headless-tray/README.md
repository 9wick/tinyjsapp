# macOS headless tray lifecycle

Requires a logged-in macOS GUI session and this checkout's rebuilt launcher:

```sh
TINYJS_AI=0 ./setup.sh
cd test/headless-tray
TINYJS_HEADLESS_TEST=1 ../../tinyjs dev
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
TINYJS_HEADLESS_TEST=1 './dist/Headless Tray Test.app/Contents/MacOS/headless-tray-test'
```

For real JavaScript confirm/prompt callbacks on the headless window's native
UIDelegate (the library's main-window delegate was never created):

```sh
TINYJS_HEADLESS_TEST=dialogs TINYJS_TEST_AUTODLG=ok ../../tinyjs dev
```

Each page must report `confirm: true` and `prompt: "value"`. The existing
native dialog test hook presses the real default button. For the file-input
callback, manually pick/cancel through the page's `<input type=file>`.

For manual tray callbacks, run without `TINYJS_HEADLESS_TEST`, click the real
menu's Open editor / Close editor / Quit actions. Opening/closing windows
must not remove the icon or terminate the backend. The page's Close button
must destroy only that named window.

Also check a scratch app containing only `src/main.js` and `tinyjs.json`
(no frontend directory at all): `headless: true` must build and start.
A regular app without the flag must still report `["main"]` and load its
initial page. A non-boolean headless config must fail, and Windows/Linux
must explicitly reject the enabled mode.
