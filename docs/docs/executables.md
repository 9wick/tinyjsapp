---
title: "executables"
---

# executables

<p class="tagline">programs your backend runs (sidecars)</p>

Programs your backend launches — a CLI built with Go, Rust, Bun, Deno, pkg or PyInstaller, or a tool like ffmpeg — go in `executables/`. A build ships only its own OS's programs, so every OS's can sit there together, and `paths().executables` points at the ones that shipped.

```text
myapp/
  executables/
    my-cli.exe            # Windows (PE): only Windows builds ship it
    my-cli                # macOS (Mach-O, universal)
    linux/my-cli          # Linux's own, since the name clashes
    linux-arm64/my-cli    # …and the arm64 one, for arm64 builds
```

```js
export async function init(app) {
  const dir = (await app.paths()).executables;   // string, or null if none shipped
  if (dir === null) return;
  const exe = dir + '/my-cli' + (tjs.env.OS === 'Windows_NT' ? '.exe' : '');
  const p = tjs.spawn([exe, '--version'], { stdout: 'pipe' });
  // …read p.stdout, await p.wait()
}
```

## which files ship {#which}

With no list, a build takes, in order:

1. the files at the top of `executables/`,
2. then `executables/<os>/` — `macos`, `windows` or `linux`,
3. then `executables/<os>-arm64/` or `<os>-x86_64/`, for that CPU's build (see [`--arch`](./cli#build)).

A later file replaces an earlier one with the same name. Files at the top that aren't this OS's programs are left out with a note; in an OS folder, they fail the build. Other subfolders aren't shipped (the build notes them).

Only native programs ship — Mach-O on macOS, PE on Windows, ELF on Linux, plus the libraries they load, and `#!` scripts on Linux. Scripts and data a program reads go in [resources](./resources).

Or list paths inside `executables/` with [`executables`](./config#executables) (a folder means the files in it). A [per-OS block](./config#per-os-overrides) replaces the list for that OS:

```json
{
  "executables": ["my-cli.exe"],
  "macos": { "executables": ["mac/my-cli", "mac/helper"] },
  "linux": { "executables": ["linux/"] }
}
```

## where they end up {#where}

Everything ships flat, so `paths().executables + '/my-cli'` is the program wherever it came from — two shipped files with one name fail the build.

- **macOS**: inside the app, in `Contents/Helpers/`.
- **Windows, Linux**: an `executables/` folder beside the executable in `dist/`.

Builds mark them executable, and [`tinyjs publish`](./cli#publish) archives and updates carry them. In `tinyjs dev` the path is `.build/executables/`, linking to your files (copies on Windows), so a rebuilt program is picked up on the next spawn — but there the file needs its own executable bit (`chmod +x`), and the build notes when it's missing.

## macOS signing {#signing}

The build signs every sidecar with the app's identity, innermost first, as `<id>.<file>`. With a Developer ID ([`signIdentity`](./config#signIdentity)) that includes the hardened runtime, which notarization requires on every executable — and which kills a JIT runtime (Bun, Deno, Node/pkg) unless it has the entitlement for it. A sidecar keeps the entitlements it arrived with; to set them, name them per file with [`executableEntitlements`](./config#executableEntitlements):

```json
{
  "macos": {
    "executableEntitlements": {
      "my-cli": ["com.apple.security.cs.allow-jit",
                 "com.apple.security.cs.allow-unsigned-executable-memory"]
    }
  }
}
```

The build warns when the app runs on Intel Macs but a sidecar has no x86_64 slice (it would fail to start there); an x86_64-only sidecar runs on Apple Silicon under Rosetta 2. A program you downloaded may be quarantined in dev: clear it with `xattr -d com.apple.quarantine <file>`.
