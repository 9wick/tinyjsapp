# Backend dialogs

From the repository root, with txiki.js installed:

```sh
bin/tjs run test/dialogs/check.js
tsc --noEmit --strict --lib es2022,dom test/dialogs/types.ts
```

`check.js` runs the real bridge over a local pipe with a simulated native UI
peer. It checks all seven methods, argument normalization, cancellation,
invalid message options, out-of-order replies, an async tray hook, the page
origin gate, and the PDF consent panel's Downloads hint. Temporary files
are created and removed under `.tmp/` in the current directory.

## Native panels (macOS, Windows, Linux)

In a logged-in desktop session, with this checkout's rebuilt launcher:

```sh
cd test/dialogs/app
../../../tinyjs dev
```

The fixture starts with `mainWindow: false` and no WebView. Its backend
awaits each native panel in `init`, printing `DIALOG <method> <action>`.
Accept `ok` panels and cancel `cancel` panels. The prompt's accepted empty
string must differ from cancellation. The message options exercise custom
labels, a detail string, and multiline detail.

It must print `PASS windowless native dialogs`, then open one named window
to verify a page's `tiny.dialog.confirm` is still denied by the API gate
even though the backend just used the same dialogs. There must be no
additional panel. It prints `PASS page gate` and quits.

Optionally set `TINYJS_DIALOG_FIXTURES` to an absolute directory containing
`one.json` and no `report.json`. After the cancellation cases, select that
file for `file`, its directory for `folder`, and save as `report.json` in
that directory for `save`. The save panel must pre-fill `report.json`
(the parent path in `name` is removed), and must not create the file.

Also run `../../../tinyjs build` and repeat with the built executable in
`dist/` (on macOS, the executable in the `.app`'s `Contents/MacOS`). Verify
the dialogs take focus when invoked from a tray/menu action, including
accessory mode, and that a second call works after cancelling the first.
Record per-OS results in `TODO-verify.md`; a successful build alone is not
a native behavior check.
