# tinyjs doctor

`tinyjs doctor` looks for the usual reasons tinyjs or an app won't run, and
says how to fix each one. Run it from your project folder to include the
project checks, or from anywhere for the rest.

It only reads files. It starts no processes, opens no windows, rebuilds
nothing and doesn't use the network. Exit status is 1 when any `FAIL` line
is printed, 0 otherwise; `WARN` and `NOTE` lines don't change it.

## What it checks

- **The install:** the bundled runtime and launcher exist and are
  executable, and a `TINYJS_LAUNCHER` override if one is set. In a source
  checkout it also warns when the launcher is older than its sources
  (`tinyjs dev` and `tinyjs build` rebuild it first), and on an Intel Mac
  that builds are Intel-only unless you pass `--arch arm64` or `--universal`.
- **PATH:** which `tinyjs` a bare `tinyjs` runs. It warns when that is a
  different install from the one running doctor, or when a second install
  sits later on PATH, the usual cause of "I updated but nothing changed".
- **The webview:** on Windows, the WebView2 Runtime in its usual install
  folders; on Linux, WebKitGTK 4.1 (`libwebkit2gtk-4.1.so.0`), plus a
  warning when there is no desktop session (`DISPLAY` / `WAYLAND_DISPLAY`).
  macOS always has WebKit.
- **Node tooling:** which of `node`, `npm`, `pnpm`, `yarn`, `bun` and `vp`
  are on PATH. The plain template needs none of them; the framework
  templates (`tinyjs new --template ...`) need one.
- **The project**, when the current folder has a `tinyjs.json`: it parses,
  has a `name` (after this OS's block is merged in), its `minTinyjsVersion`
  isn't newer than this tinyjs, the package manager its `frontend.build` /
  `frontend.dev` commands run is on PATH, and a project with a
  `package.json` has its `node_modules` installed. A `tinyjs.json` with no
  `"$schema"` line (projects made before 0.57.5) gets a note suggesting it,
  for editor completion; see [config-schema.md](config-schema.md).

## Limits

A clean run can't prove a window will open. Binary architecture, shared
libraries other than WebKitGTK, and OS security settings (Gatekeeper,
SmartScreen) aren't checked. WebView2 installed somewhere unusual, such as
a fixed-version runtime, reads as not found, which is why that is a warning
rather than a failure.
