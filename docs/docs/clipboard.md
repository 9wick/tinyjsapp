---
title: "clipboard"
---

# clipboard

<p class="tagline">tiny.clipboard — read, write and watch the system clipboard</p>

`tiny.clipboard` reads and writes the system clipboard from the launcher process: text, HTML, files, images and colours, in any combination. It also tells you when the clipboard changes, which is what a clipboard-history app or a "paste from clipboard" button needs. The launcher talks to the OS clipboard directly, so there are no `pbpaste` or `xclip` processes, and writing several files at once never loses the last few.

Use it instead of `navigator.clipboard` when you need files, images or change notifications, or when the page isn't focused.

The backend has the same calls on `app.clipboard`, and an `onClipboardChange(info, app)` export in place of `onChange` (see [hooks](./backend#hooks)).

```js
const clip = await tiny.clipboard.read();
if (clip.kind === 'text') console.log(clip.text);

await tiny.clipboard.write({ text: 'hello' });
```

## reading {#read}

`tiny.clipboard.read()` resolves to an object describing everything on the clipboard right now:

```js
const clip = await tiny.clipboard.read();
switch (clip.kind) {
  case 'files': addAttachments(clip.paths); break;
  case 'image': showImage(tiny.fileURL(clip.image), clip.imageSize); break;
  case 'text':  insert(clip.html ?? clip.text); break;
}
```

| field | type | |
|---|---|---|
| `kind` | `'files'`, `'image'`, `'color'`, `'text'`, `'empty'` | what the clipboard mainly holds |
| `changeCount` | number | the change counter — see [watching](#watch) |
| `text` | string or `null` | plain text |
| `html` | string or `null` | HTML, when the source provided it |
| `paths` | string[] | real file paths (`kind: 'files'`) |
| `image` | string or `null` | path of a PNG copy of the image (`kind: 'image'`) |
| `imageSize` | `{ width, height }` or `null` | the image's size in pixels |
| `color` | string or `null` | `'#rrggbb'` or `'#rrggbbaa'` (`kind: 'color'`) |
| `concealed` | boolean | a password manager marked the content secret |
| `sourceApp` | `{ name, bundleId }` or `null` | the app the content came from |
| `sourceURL` | string or `null` | the page a Chromium-based browser copied from |

Several fields can be set at once — a copy from a browser usually has both `text` and `html`. `kind` picks the most specific one: files, then image, then colour, then text.

`image` is a temporary file the launcher writes for you. Copy it somewhere if you want to keep it: a later `read()` may overwrite or delete it.

### per-OS differences {#read-os}

| | macOS | Windows | Linux |
|---|---|---|---|
| `text`, `html`, `paths`, `image` | yes | yes | yes |
| `color` | yes | `null` | `null` |
| `concealed` | yes | always `false` | always `false` |
| `sourceApp` | yes | `null` | `null` |
| `sourceURL` | yes | `null` | `null` |


`concealed` is `true` when the content carries the `org.nspasteboard.ConcealedType` or `TransientType` marker, which password managers set. A clipboard-history app should not store that content.

`sourceApp` is the app that was frontmost when the change was first noticed. It's exact while you're [watching](#watch); without a watch it's worked out at your next `read()`, by which time the user may have switched apps. Your own writes are attributed to your app.

## writing {#write}

`tiny.clipboard.write(data)` replaces the whole clipboard with what you pass. Any combination of fields works, and each lands in the format other apps expect:

```js
await tiny.clipboard.write({ text: 'Total: 42', html: '<b>Total:</b> 42' });
await tiny.clipboard.write({ paths: ['/Users/me/a.png', '/Users/me/b.png'] });
await tiny.clipboard.write({ image: '/tmp/chart.png' });
await tiny.clipboard.write({ color: '#ff8800' });
```

| field | |
|---|---|
| `text` | plain text |
| `html` | HTML |
| `paths` | absolute file paths; pasting into a file manager copies the files |
| `image` | a PNG file path, a `data:` URL, or raw base64 |
| `color` | `'#rrggbb'` or `'#rrggbbaa'` |

Writing is fire-and-forget: the promise resolves once the request is sent, and a field the launcher can't use (an image path that doesn't exist, say) is left out without an error. Windows and Linux have no clipboard format for colours, so `color` is written as text there, unless you also passed `text`.

On Linux, the clipboard content stays with your app until another app copies something. If your app quits and no clipboard manager is running, what it copied goes with it — the usual X11 and Wayland behaviour.

The backend's `app.clipboard.write()` returns `true` straight away rather than a promise.

## watching for changes {#watch}

`onChange(fn)` calls `fn` each time the clipboard changes, and starts watching if this page isn't already:

```js
const off = tiny.clipboard.onChange(async ({ changeCount, self }) => {
  if (self) return;                    // our own write()
  const clip = await tiny.clipboard.read();
  if (!clip.concealed) history.add(clip);
});
```

`self` is `true` when your own `write()` caused the change. The handler returns a function that removes it.

To choose the polling interval, call `watch(intervalMs)` yourself (default 500 ms); `unwatch()` stops this page's watch.

```js
await tiny.clipboard.watch(250);
// …later
await tiny.clipboard.unwatch();
```

The launcher runs one watcher for the whole app at the fastest interval anyone asked for. Each window and the backend has its own watch, so one window's `unwatch()` doesn't silence another window or the backend. A change event goes to every window, so a page can still hear changes after its own `unwatch()` while something else is watching — remove the handler if you want silence.

How each OS notices changes:

- **macOS** polls the clipboard's change counter in the launcher, at least 100 ms apart.
- **Windows** polls the clipboard sequence number at the interval you asked for.
- **Linux** gets an event from the system when the clipboard changes, so the interval doesn't matter.

### changeCount {#changeCount}

`tiny.clipboard.changeCount()` resolves to the current change counter, without reading the contents. Keep the last one you saw, and after a gap — waking from sleep, a window coming back — one call tells you whether reading again is worthwhile:

```js
let seen = (await tiny.clipboard.read()).changeCount;

window.addEventListener('focus', async () => {
  const now = await tiny.clipboard.changeCount();
  if (now !== seen) { seen = now; refresh(await tiny.clipboard.read()); }
});
```

On macOS and Windows this is the system's own counter, and it keeps counting with no watch running. On Linux it's a counter the launcher keeps from 0 each time the app starts; it also counts with no watch running. Compare values only within one run of the app.

## in the backend {#backend}

```js
// src/backend/main.js
export function onClipboardChange({ changeCount, self }, app) {
  if (!self) app.clipboard.read().then(save);
}
```

Exporting `onClipboardChange` starts a 500 ms watch for the backend. Call `app.clipboard.watch(ms)` in `init` for a different interval. `app.clipboard.write()`, `watch()` and `unwatch()` return `true` immediately; `read()` and `changeCount()` return promises.

In a page, the same event is `tiny.api.on('clipboard-change', fn)`.

## in a site wrapper {#api-gate}

The calls go over the wire as `clip.read`, `clip.write`, `clip.changeCount`, `clip.watch` and `clip.unwatch` — the names to use in the [`api`](./config#api) gate. The `"wrapper"` preset allows `clip.write` but not reading, so a wrapped site can copy but can't see what the user copied elsewhere.
