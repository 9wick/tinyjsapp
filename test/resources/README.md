# Bundled data resources

Run from the repository root after `./setup.sh` (macOS/Linux) or `setup.ps1`
(Windows). Uses the actual txiki CLI, compiler, native launcher and webview;
requires a graphical session and Python 3.8+. No Python packages needed.

```sh
python3 -u test/resources/check.py
tsc --noEmit --strict --skipLibCheck --lib ES2022,DOM test/resources/types.ts
```

The second command needs TypeScript on PATH and checks the exact nullable
backend/frontend types against the public declarations. `skipLibCheck`
avoids unrelated declaration checks; the resource type assertions are checked.

The first command creates a temporary project and small binary/text fixtures,
then removes only its own temporary files and processes. It checks:

- invalid config, absent tinyjs.json, missing paths, traversal, POSIX/drive/UNC
  paths, a list with no `resources/` folder; rejection in dev and build before
  staging;
- direct, parent and nested symlinks, and `resources/` itself as a symlink
  (skipped with a reported reason if the OS denies symlink creation);
- no list ships the whole `resources/` folder;
- files, nested/empty directories, binary bytes, spaces/Unicode, normalized
  backslashes, duplicate and overlapping entries, platform config overrides;
- dev reads in place; real builds and backend reads plus real frontend
  `tiny.app.paths()` RPC, including null for absent/empty lists;
- relocating the whole distribution and running from another directory;
- macOS bare executable and .app, including signature verification;
- rebuilding removes excluded resources; the local publish archive contains
  exact bytes (no GitHub Release/upload);
- a URL wrapper without a local frontend, in dev and packaged modes;
- normal builds without resources and cleanup after resources are removed.

Windows/Linux portable builds and archives use the same script, but must be
run on those OSes to claim verification. The test doesn't notarize, sign
third-party executables, install an update, or build other CPU architectures.

## Verified runs

2026-10-13, after the switch to the `resources/` folder: macOS 27.0 arm64
`check.py` PASS. Linux PASS the same day on Ubuntu 22.04 x86_64 (container,
Xvfb, command below) and Ubuntu 24.04 arm64 under GNOME Wayland. Windows
passed with two fixture names swapped (TODO-verify.md).

The runs below were of #49's original project-relative layout — 2026-10-11:

- macOS 27.0 arm64: `python3 -u test/resources/check.py` — PASS, including
  actual webview RPC in dev, compiled bare executables and relocated .app
  bundles; `codesign --verify --deep --strict` passed. The nullable type
  check above also passed with TypeScript 7.0.2.
- Linux x86_64: Ubuntu 22.04.5 in an isolated Docker container, txiki.js
  v26.6.0, GTK 3.24.33 and WebKitGTK 2.50.4. `./setup.sh` compiled the native
  launcher. As an unprivileged user, after installing Xvfb, xauth and
  dbus-x11 alongside the normal setup build dependencies:

  ```sh
  xvfb-run -a -s "-screen 0 1280x800x24" dbus-run-session -- python3 -u test/resources/check.py
  ```

  PASS, including actual WebKitGTK/frontend RPC in dev and compiled portable
  executables, relocation, binary bytes, all path/symlink checks, platform
  overrides, repeated-build cleanup, publish tar.gz contents, URL wrappers
  and null without resources. Xvfb runs the real launcher/webview on virtual
  X11; no manual visual inspection or Wayland run was performed. The nullable
  type check also passed on the Debian 12 Linux host with TypeScript 7.0.2.

Windows, Linux arm64, Wayland, macOS Intel/universal, notarization and actual
update installation remain untested. These runs exercised the implementation
at commit `bc51a85`; subsequent changes only document verification results.
