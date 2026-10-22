---
title: "system services"
---

# system services

<p class="tagline"><code>tiny.app.pickColor</code> · <code>thumbnail</code> · <code>spotlight</code> · <code>captureScreen</code></p>

Things the OS already does well — picking a colour off the screen, drawing a preview of a file, searching the user's files, taking a screenshot — handed to your app as one call each. They run on the machine, with nothing to install and no network. They aren't all on every OS yet, so check before showing the UI for one:

```js
const caps = await tiny.system.capabilities();
if (caps.pickColor !== false) showEyedropperButton();
```

A key is `false` where the call can't work, and absent where it can (see [portability](./portability)). The backend has the same calls under the same names — `app.pickColor()`, `app.thumbnail()` and so on.

| | macOS | Windows | Linux |
|---|---|---|---|
| [`pickColor`](#pick-color) | yes | no | through the desktop portal |
| [`thumbnail`](#thumbnail) | any file | any file | images only |
| [`spotlight`](#spotlight) | Spotlight: names and contents | no | `plocate`/`locate`, or `find`: names only |
| [`captureScreen`](#capture-screen) | macOS 14+, with permission | yes | X11 only |

Where a call can't work it rejects with the reason (on Windows, `'unsupported on windows'`), rather than resolving an empty answer that looks like "nothing found".

## colour picker {#pick-color}

```js
const color = await tiny.app.pickColor();   // '#rrggbb', or null if the user cancels
```

Shows the system eyedropper; the user can pick a pixel from any app on any screen. It needs no screen-recording permission. On macOS it's the native colour sampler; on Linux it's the desktop portal's colour picker, so the look depends on the desktop. Windows rejects for now.

## thumbnails {#thumbnail}

```js
const { path, width, height } = await tiny.app.thumbnail('/Users/me/design.psd', 256);
img.src = tiny.fileURL(path);
```

Makes a png preview of a file and resolves `{ path, width, height }`. The png is in the temp folder and belongs to you: copy it if you want to keep it. `size` (default 256) is the box the picture fits in, keeping its proportions. Read the real size off `width` and `height`, since it differs by OS:

- **macOS** renders at 2× (up to 512 px for a size of 256). Any path works: a real preview for files Quick Look can render — images, video, PDF, source code — and the file, folder or app icon for anything else, so it never fails because of the file type.
- **Windows** asks the shell, at exactly `size` pixels, for any file type it has a preview or an icon for.
- **Linux** handles images only, at up to 2×; an image smaller than that comes back at its own size. Other files reject.

A path that doesn't exist rejects on every OS.

## searching files {#spotlight}

```js
const paths = await tiny.app.spotlight('invoice');   // up to 100 absolute paths
```

Finds files whose name contains the text, ignoring case.

- **macOS** searches with Spotlight, in the user's home folder, and matches file contents as well as names.
- **Linux** matches names and paths with `plocate` or `locate`, which search an index the system rebuilds periodically, so very new files may be missing. Without either, it falls back to `find` in the home folder: six folders deep, skipping hidden folders and `node_modules`, for at most four seconds. Ask `tiny.system.requirements(['spotlight.index'])` whether an index is installed, and how to install one (see [portability](./portability)).
- **Windows** rejects for now.

## screenshots {#capture-screen}

```js
const primary = (await tiny.app.screens()).find((s) => s.primary);
const { path, width, height } = await tiny.app.captureScreen(primary.id);
```

Saves a png of a screen to the temp folder and resolves `{ path, width, height }` in pixels. The file is yours to move or delete. Take the id from [`tiny.app.screens()`](./window). Without one, it captures the first screen the OS lists, which isn't always the primary — pass the primary's id, as above, to be sure.

- **macOS** needs macOS 14 and the `'screen'` permission (see [permissions](./permissions)); without them it rejects with the reason. The cursor isn't included.
- **Windows** captures the screen with that id; no permission is needed.
- **Linux** works under X11 only and captures the whole desktop — every screen together — whatever id you pass. Wayland rejects: there, only the desktop's own screenshot portal can capture, and it asks the user each time.

To read the text in a screenshot, pass the path to [`tiny.macos.ocr()`](./macos-only#ocr). For video, see [`tiny.macos.recorder`](./macos-only#recorder).
