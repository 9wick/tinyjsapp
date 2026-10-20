# Download extras (README, licence beside the app)

Run from the repository root after `./setup.sh` (macOS/Linux) or `setup.ps1`
(Windows). Uses the real CLI and compiler; builds only, so it needs no
graphical session (macOS mounts the dmg with `hdiutil`).

```sh
python3 -u test/extras/check.py
```

It checks:

- no `extras/`: nothing ships, nothing printed;
- no list: the top level ships, `extras/<os>/` replaces a file by name,
  folders ship whole, `.DS_Store` and other OSes' folders are skipped, and
  (macOS/Linux) an `install.sh` keeps its exec bit;
- where they land: `dist/` on Windows/Linux, the dmg root on macOS, never
  inside the .app or bare `dist/` on macOS; a macOS build without `--dmg`
  prints a note;
- `tinyjs publish`: the Windows zip / Linux tarball carry them in the app
  folder (Linux: exec bit too); the macOS update zip doesn't;
- macOS: a rebuilt dmg picks up an edited extra;
- lists: entries from any folder land by name, an OS block replaces the
  root list, `[]` ships nothing;
- errors fail before compiling: a name the build writes (case-insensitive,
  also from the OS layer), two extras with one name (Linux also: names
  that differ only by case), `..`, absolute paths, missing entries,
  `extras/` itself, a non-array, a list without the folder, symlinks at the
  top and inside a folder;
- a README in `assets/` gets a note pointing at `extras/`;
- macOS: the .app inside the dmg passes `codesign --verify --deep --strict`,
  signed ad-hoc, or with `TINYJS_TEST_SIGN_IDENTITY="Developer ID
  Application: …"` by that identity (the script drops an exported
  `TINYJS_SIGN_IDENTITY` otherwise). It doesn't notarize.

## Verified runs

- 2026-10-20, macOS 27.0 arm64: `check.py` PASS, ad-hoc and with a
  Developer ID identity.
