---
title: "deep links & files"
---

# deep links & files

<p class="tagline">myapp:// links, file associations, single instance</p>

An app can claim a URL scheme, so a `myapp://…` link anywhere on the system opens it, and file types, so it shows up under "Open With". Links and files reach the backend through the `onOpenUrl` and `onOpenFiles` hooks, and the page through `tiny.app.onOpenUrl` and `tiny.app.onOpenFiles`. A built app also runs as a single instance: opening it again brings the running copy forward and hands it whatever was opened.

All of this needs a built app. `tinyjs dev` registers nothing.

## claiming a scheme or file type {#register}

```json
{
  "id": "com.example.notes",
  "urlScheme": "notes",
  "fileExtensions": ["md", "txt"],
  "openFolders": true
}
```

- [`urlScheme`](./config#urlScheme) is a string or a list of schemes.
- [`fileExtensions`](./config#fileExtensions) are extensions without the dot.
- [`openFolders`](./config#openFolders) lets folders be opened with the app (macOS and Linux).

How each OS registers them:

| | when | URL scheme | file types | folders |
|---|---|---|---|---|
| **macOS** | when the `.app` is built: the keys go into its `Info.plist`, and macOS picks them up when the app is first seen | listed for the scheme. If another app claims the same scheme, macOS decides which one opens it | listed under Open With, and may become the default for a type nothing else claims | listed under Open With, never the default |
| **Windows** | each time the built app starts, under `HKCU\Software\Classes` (no admin) | the app becomes the scheme's handler for this user | added to Open With, not made the default | — |
| **Linux** | each time the built app starts: a `.desktop` file in `$XDG_DATA_HOME/applications`, usually `~/.local/share/applications` (which also puts the app in the app menu), listing the app under the type the system already has for each extension (`text/markdown` for `.md`); only an extension nothing claims gets a type of the app's own | the app becomes the scheme's default handler (`xdg-mime`) | added to Open With, not made the default | listed under Open With |

On Windows and Linux the app has to run once before links and files can reach it. tinyjs doesn't remove the entries when the app is deleted.

## receiving links and files {#receive}

```js
// src/backend/main.js
export function onOpenUrl(url, app) {
  const u = new URL(url);                       // notes://open?id=42
  if (u.hostname === 'open') app.push('show-note', { id: u.searchParams.get('id') });
}

export function onOpenFiles(paths, app) {
  // absolute paths: files and folders from Open With, the Dock icon, the command line
  for (const p of paths) openDocument(p, app);
}
```

```js
// page
const offUrl = tiny.app.onOpenUrl((url) => route(url));
const offFiles = tiny.app.onOpenFiles((paths) => paths.forEach(openDocument));
```

The backend hooks get `url` as a string and `paths` as an array of absolute paths. The page functions return a function that removes the listener. They're the `'open-url'` and `'open-files'` events, which you can also hear with `tiny.api.on`. See [hooks](./backend#hooks).

Files dragged onto a *window* aren't an open. They arrive in [`tiny.win.onDrop`](./window#files). Files dropped on the Dock icon, or on the app in Finder, are, and arrive in `onOpenFiles`.

### at startup {#cold-start}

When a link or file starts the app, the backend hook gets it as soon as the backend is up, so nothing is lost. The page event goes out at the same moment, and the page may not have loaded yet. If the page needs to know what the app was opened with, keep it in the backend and let the page ask:

```js
// backend
let opened = [];
export function onOpenFiles(paths, app) {
  opened.push(...paths);
  app.push('files-opened');
}
export const api = {
  takeOpenedFiles: async () => opened.splice(0),
};

// page — ask once at startup, and again whenever more arrive
const load = async () => (await tiny.api.call('takeOpenedFiles')).forEach(openDocument);
tiny.api.on('files-opened', load);
load();
```

### links are input {#untrusted}

Any web page, email or other app can open a `myapp://` link, with whatever path and query it likes. Parse it with `new URL()`, accept only the actions you expect, and never pass its parts to a shell, a file path or a database query unchecked. Ask before doing anything destructive.

In a [site wrapper](./site-wrappers#securing) these events reach the wrapped site's JavaScript too, like every event, so a deep link carrying a token or an opened file's path is visible to it.

## single instance {#single-instance}

A built app runs once per user. Opening it again, by its icon, a link, Open With or the command line, brings the running copy forward and hands it the link or files instead of starting a second copy. The hooks fire in the running copy, and on Windows and Linux its main window is shown.

| | how |
|---|---|
| **macOS** | LaunchServices does it for the `.app`. Starting the bare `dist/<name>` executable, or the [`--cli` shim](#command-line) that runs it, starts a second copy |
| **Windows** | a named pipe, `tinyjs-app-<id>-<user>`, locked to this user. A second launch passes its files to the first and exits |
| **Linux** | a socket, `tinyjs-app-<id>.sock` in `$XDG_RUNTIME_DIR` (or a private `tinyjs-<uid>` folder in the temp dir when that's unset). A second launch passes its files to the first and exits |

The instance is keyed on [`id`](./config#id), so two apps with the same `id` would hand off to each other. Give every app its own.

If the pipe or socket can't be used safely (on Windows, another user already holds that pipe name; on Linux, the socket folder isn't a private folder owned by this user), the app prints a warning and runs without single instance or link hand-off.

## the command line {#command-line}

A built app treats its command-line arguments as files to open:

```sh
dist/notes ~/todo.md ./ideas.txt --verbose
# onOpenFiles(['/Users/me/todo.md', '/Users/me/project/ideas.txt'])
```

Arguments starting with `-` are skipped, relative paths are resolved against the current folder, and anything that isn't an existing file or folder is dropped. A URL on the command line is dropped too. Links only arrive through the OS. If the app is already running (on Windows and Linux), the paths go to the running copy.

[`tinyjs build --cli`](./cli#build) writes `dist/bin/<name>` (`<name>.cmd` on Windows), a small script that runs the built app with its arguments, for putting on your PATH. On macOS it runs the bare executable rather than the `.app`, so with the app already open it starts a second copy.

## becoming the default app {#default-handler}

Registering a file type puts the app under Open With. It doesn't make it the default.

- **Linux**: `tiny.app.setAsDefaultHandler('md')` (or `'folder'`) makes it the default, for a type in `fileExtensions`. See [becoming the default app](./shell#default-handler).
- **Windows** doesn't let apps make themselves the default. Tell the user to choose the app in Settings → Default apps, or in the Open With dialog.
- **macOS**: the user sets it in Finder's Get Info, under "Open with" → "Change All…". `setAsDefaultHandler` answers `'unsupported'` on macOS and Windows.

URL schemes are different: on Windows and Linux the app takes the scheme over when it registers.

## testing {#testing}

Build the app, run it once, then open a link the way a user would:

```sh
open 'notes://open?id=42'                  # macOS
start notes://open?id=42                   # Windows (cmd)
xdg-open 'notes://open?id=42'              # Linux
```

For files, use the system's Open With on a file of a registered type, or pass paths on the command line.
