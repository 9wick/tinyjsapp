# Bundled executables (sidecars)

Run from the repository root after `./setup.sh` (macOS/Linux) or `setup.ps1`
(Windows). Uses the real CLI, compiler, launcher and webview; needs a
graphical session and Python 3.8+.

```sh
python3 -u test/executables/check.py
tsc --noEmit --strict --skipLibCheck --lib ES2022,DOM test/executables/types.ts
```

The sidecar is a copy of `bin/tjs` — a native binary on every OS, so no
compiler is needed. The test app's backend spawns it from
`app.paths.executables` and checks what it printed; the frontend checks
`tiny.app.paths()` returns the same folder. Files that must NOT win are
64-byte stubs that pass the binary check but can't run, so a spawn that
works proves the right file shipped. It checks:

- no list: the root ships; another OS's binary, a text file and a
  subfolder at the root are noted and left out; `.DS_Store` and other OS
  folders ignored;
- `<os>/` overrides the root and `<os>-<arch>/` overrides `<os>/` by file
  name, in dev and build; the other CPU's folder is ignored;
- in an OS folder a text file, a subfolder, another OS's binary fail (macOS
  also: a `#!` script, a Java class file with the fat-Mach-O magic);
  symlinks fail at the root and in OS folders;
- `"executables"` lists: folder and file entries, normalised paths, per-OS
  block replacing the root list, the `resources` path errors, a name clash,
  a listed non-binary, a list without the folder, `[]` ships nothing;
- dev runs it from `.build/executables`; the bare binary and (macOS) the
  .app run it after the whole `dist/` is moved; files are executable;
- macOS: `Contents/Helpers/` holds the sidecar, signed as `<id>.side-car`,
  and `codesign --verify --deep --strict` passes on the relocated bundle;
- the `tinyjs publish` archive carries the sidecar with its exec bit;
- a backend at the project root doesn't copy `executables/` into the app;
- macOS: the missing-slice message (cc-built thin binary for the other
  arch: a Rosetta note on arm64, a warning on Intel); a pre-signed sidecar keeps its entitlements;
  `"executableEntitlements"` replaces them; bad values fail the build;
- no folder, or nothing for this OS: `null`, nothing shipped.

Builds sign ad-hoc: the script drops an exported `TINYJS_SIGN_IDENTITY`.
With `TINYJS_TEST_SIGN_IDENTITY="Developer ID Application: …"` and `bun` on
PATH, macOS also builds a `bun build --compile` sidecar: signed with the
hardened runtime it must die without `allow-jit` and run with the
entitlements from the docs, inside a bundle that still verifies. It signs
with your identity (and fetches timestamps) but doesn't notarize.

On Windows the project folder has no `ü`: tjs.exe's argv is ANSI (see
TODO-verify.md, resources).

## Verified runs

- 2026-10-14, macOS 27.0 arm64: `check.py` PASS on the root + overrides +
  list layout, ad-hoc and with a Developer ID identity (bun 1.3.5 sidecar crashed without `allow-jit`, ran
  with it). `types.ts` PASS with TypeScript 6.0.2.
- 2026-10-14, Windows 11 arm64 (x64 `tjs.exe`, so x86_64 builds), Python
  3.13: `check.py` PASS; symlinks SKIP without Developer Mode (junctions
  checked by hand, refused). DLL-beside-sidecar and auto-update runs are in
  TODO-verify.md.
