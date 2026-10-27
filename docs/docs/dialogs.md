---
title: "dialogs"
---

# dialogs

<p class="tagline">tiny.dialog — native file pickers and message boxes</p>

`tiny.dialog` opens the operating system's own panels: file pickers for opening and saving, and message boxes for alerts, confirmations and short text input. The launcher runs them — NSOpenPanel and NSAlert on macOS, the common item dialog and MessageBox on Windows, GTK's file chooser and message dialogs on Linux. They are application-modal rather than attached to one window, which is why they live on `tiny.dialog` and not on `tiny.win`.

Every call returns a promise that settles when the user closes the panel. Cancelling is never an error: the pickers resolve `null`, `confirm` resolves `false`.

```js
const path = await tiny.dialog.openFile({ types: ['md', 'txt'] });
if (path === null) return;          // cancelled
const text = await tiny.api.call('readText', { path });
```

The backend has the same calls on `app.dialog`, with the same arguments and results (see the [API map](./api-map#dialog)). They work without a page or main window, including `"mainWindow": false` tray apps. The launcher displays the panel; no WebView is created for it.

```js
// backend: a tray menu item exports a report
export async function onTray(id, app) {
  if (id !== 'export') return;
  const path = await app.dialog.saveFile({ types: ['json'], name: 'report.json' });
  if (path === null) return;
  await tjs.writeFile(path, new TextEncoder().encode(JSON.stringify({ status: 'ok' })));
}
```

In a page, the picker returns a real filesystem path; reading or writing the file is the [backend](./backend)'s job. `saveFile` itself never writes the file on either side.

## opening files {#open}

```js
await tiny.dialog.openFile(opts?)     // → string | null
await tiny.dialog.openFiles(opts?)    // → string[] | null
await tiny.dialog.pickFolder()        // → string | null
```

`openFile` lets the user choose one file, `openFiles` one or more, and `pickFolder` a folder. Each resolves the absolute path (or an array of paths), or `null` if the user cancels.

```js
const paths = await tiny.dialog.openFiles({ types: ['png', 'jpg', 'jpeg'] });
for (const p of paths ?? []) addImage(p);

const dir = await tiny.dialog.pickFolder();
if (dir) await tiny.store.set('projectDir', dir);
```

| option | applies to | |
|---|---|---|
| `types` | `openFile`, `openFiles`, `saveFile` | file extensions that can be chosen — see [file types](#types) |
| `name` | `saveFile` | the file name the save panel starts with |

`pickFolder` takes no options.

## file types {#types}

`types` is a list of extensions without dots: `['md', 'markdown', 'txt']`. A leading dot and upper case are tolerated (`'.MD'` becomes `'md'`); anything else that couldn't be an extension is dropped. Leave `types` out and every file can be chosen.

- **macOS**: only files with those extensions can be chosen. An extension macOS doesn't know still filters.
- **Windows and Linux**: the panel starts on a filter of those extensions and also offers "All files", so the user can still pick anything. On Linux the filter matches the extension in lower and upper case.

Because Windows and Linux let the user step outside the filter, check the extension of what comes back if your code depends on it.

## saving {#save}

```js
await tiny.dialog.saveFile(opts?)     // → string | null
```

`saveFile` asks where to save and resolves the chosen path, or `null`. It doesn't write anything: send the path and the data to your backend.

```js
const path = await tiny.dialog.saveFile({ types: ['docx'], name: 'report' });
if (path) await tiny.api.call('exportReport', { path });   // …/report.docx
```

`name` pre-fills the file name field. It is a file name, not a path: any folder part is dropped. Without it, macOS shows "Untitled" and Windows and Linux an empty field.

When the user types a name with no extension, Windows and Linux add the first extension in `types` — as long as the type filter, not "All files", is selected. A name that already has an extension is left alone. On macOS the save panel handles extensions itself.

Each OS asks before replacing an existing file. One Linux caveat: the extension is added after GTK's overwrite check, so if the user types `report` and `report.docx` already exists, the panel doesn't warn.

## alert, confirm and prompt {#messages}

```js
await tiny.dialog.alert(message, opts?)     // → true
await tiny.dialog.confirm(message, opts?)   // → true | false
await tiny.dialog.prompt(message, opts?)    // → string | null
```

The message is the headline; `detail` is smaller text under it. `ok` and `cancel` relabel the buttons on every platform.

```js
await tiny.dialog.alert('Export finished', { detail: '12 files written to Downloads.' });

const sure = await tiny.dialog.confirm('Delete 3 notes?', {
  detail: 'This can’t be undone.',
  ok: 'Delete',
  cancel: 'Keep',
});

const title = await tiny.dialog.prompt('Rename note', { default: 'Untitled', ok: 'Rename' });
if (title !== null) rename(title);
```

| option | `alert` | `confirm` | `prompt` | |
|---|:-:|:-:|:-:|---|
| `detail` | ✓ | ✓ | — | secondary text; line breaks are kept |
| `ok` | ✓ | ✓ | ✓ | label for the OK button |
| `cancel` | — | ✓ | ✓ | label for the Cancel button |
| `default` | — | — | ✓ | the text the input field starts with |

- `alert` resolves `true` once dismissed.
- `confirm` resolves `true` for OK and `false` for Cancel.
- `prompt` resolves the entered text — possibly `''` — for OK, and `null` for Cancel.

For `alert` and `confirm`, a string second argument is the detail: `tiny.dialog.confirm('Quit?', 'Unsaved changes will be lost.')`. `prompt` has no such shorthand and rejects a string with a `TypeError` — pass `{ default }`. Any other second argument that isn't an object (an array, a number) also rejects with a `TypeError`.

An empty message falls back to the app name. On Windows the message box shows the app name in its title bar and the message and detail together as its text.

## the page's own alert() {#browser-dialogs}

The page's bare `alert()`, `confirm()` and `prompt()` are the browser's built-ins, not these. They block the page, take only a message, use the page's origin (or the app name) as the headline, and can't relabel their buttons. Use `tiny.dialog` in your own code; the built-ins are there so that sites and libraries that call them still work, for example in a [site wrapper](./site-wrappers).

## in a site wrapper {#site-wrappers}

Under a tinyjs.json [`api`](./config#api) gate, dialogs are the `dialog.*` methods — `dialog.openFile`, `dialog.confirm` and so on. The `"wrapper"` preset allows them, so a wrapped site can open the user's file pickers. Disable `dialog.*` if it shouldn't.

The gate applies to calls from pages. Backend `app.dialog` calls are trusted app code, like other `app` methods, and are not restricted by the page's origin rules.
