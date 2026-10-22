---
title: "extras"
---

# extras

<p class="tagline">README, licence — beside the download</p>

Files for the person downloading your app — a README, a licence, install notes — go in `extras/`. They ship next to the app, never inside it:

- **macOS**: at the root of the dmg, beside the app and the Applications shortcut.
- **Windows, Linux**: in the app's folder beside the executable — `dist/` and the [`tinyjs publish`](./cli#publish) archive.

```text
myapp/
  extras/
    LICENSE.txt           # every OS
    README.txt            # Windows and Linux…
    macos/README.txt      # …and the Mac's own, which mentions Gatekeeper
```

## which files ship {#which}

With no list, a build ships the top of `extras/`, then `extras/<os>/` (`macos`, `windows`, `linux`), which replaces a file with the same name. Folders ship whole and keep their executable bits, so an `install.sh` in a Linux archive runs. The build prints what it shipped.

Or list paths inside `extras/` with [`extras`](./config#extras) — each lands under its own name, a [per-OS block](./config#per-os-overrides) replaces the list, and `[]` ships nothing:

```json
{
  "extras": ["LICENSE.txt", "README.txt"],
  "macos": { "extras": ["LICENSE.txt", "macos/README.txt"] }
}
```

## rules {#rules}

- A name the build already writes there (`launcher.exe`, the app, `Applications`, `resources`, …) fails the build, compared ignoring case; so do two extras with one name.
- Listed paths must exist; absolute, drive and UNC paths, `..` and symlinks fail. On Windows, path parts can't end in a dot or a space.

## macOS: only the dmg carries them {#macos}

Build with [`--dmg`](./cli#build), or let [`tinyjs notarize --dmg`](./cli#notarize) rebuild it. The app itself and the update zip never carry extras; a build without `--dmg` notes that they're left out.

## updates {#updates}

On Linux an [update](./auto-update) replaces the whole app folder, extras included. On Windows it copies the new files over the old by name, so an extra you drop or rename stays behind.

For help people need after installing, use the app itself: [credits, a help book](./assets), or a Help menu item that opens a file from [resources](./resources).
