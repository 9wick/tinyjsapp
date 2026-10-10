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

- invalid config, absent tinyjs.json, missing paths, traversal, reserved roots,
  POSIX/drive/UNC paths; rejection in dev and build before staging;
- direct, parent and nested symlinks (skipped with a reported reason if the OS
  denies symlink creation);
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
