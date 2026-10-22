---
title: "your first app"
---

# your first app

<p class="tagline">a notebook that remembers, in four files</p>

This builds a small desktop notebook: write a note, edit it, delete it, and find it still there the next time the app opens. Along the way it uses the three things almost every tinyjs app does — a page that calls its [backend](./backend), the backend doing the work, and data saved with [store](./store). Plain HTML and JavaScript: no framework, no packages to install.

Based on a tutorial by [@Zulut30](https://github.com/Zulut30) ([#65](https://github.com/tarwin/tinyjsapp/pull/65)).

## create the project {#create}

With tinyjs [installed](./install):

```sh
tinyjs new notes
cd notes
```

That's a working app already — `tinyjs dev` opens it. Before going on, give the app an id of your own in `tinyjs.json`. It names the folder the notes are saved in, so pick it once and keep it:

```json
{
  "$schema": "https://tinyjs.app/schema/tinyjs.schema.json",
  "name": "notes",
  "title": "Notes",
  "size": "760x640",
  "id": "com.yourname.notes",
  "version": "0.1.0"
}
```

## the backend {#backend}

Replace `src/backend/main.js`. Each function in `api` is something the page can call; it gets the page's parameters and the [`app` handle](./backend#app), and whatever it returns goes back to the page.

```js
// src/backend/main.js — runs on txiki.js, with the app's store and the system
const KEY = 'notes';
const MAX_TEXT = 2000;
let sequence = 0;
let savedNotes = null; // the last list that really reached the disk

// Run read-change-write steps one at a time, even when calls overlap, so
// two quick saves can't each start from the same list and lose a note.
let pending = Promise.resolve();
function inOrder(step) {
  const result = pending.then(step);
  pending = result.catch(() => {});
  return result;
}

function textFrom(params) {
  const text = params?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
    throw new Error('Write a note between 1 and 2000 characters.');
  }
  return text;
}

async function readNotes(app) {
  if (savedNotes !== null) return savedNotes;
  const notes = await app.store.get(KEY);
  if (notes === null) return (savedNotes = []);
  if (!Array.isArray(notes)) throw new Error('The saved notes are in an unexpected format.');
  return (savedNotes = notes);
}

async function saveNotes(app, notes) {
  // store.set resolves false when the disk write fails — it doesn't throw.
  if (!(await app.store.set(KEY, notes))) {
    throw new Error('Could not save the notes. Check disk space and permissions.');
  }
  savedNotes = notes; // only once it's really saved
  return notes;
}

export const api = {
  listNotes: (_params, app) => inOrder(() => readNotes(app)),

  addNote: (params, app) => inOrder(async () => {
    const text = textFrom(params);
    const notes = await readNotes(app);
    const id = Date.now().toString(36) + '-' + ++sequence;
    return saveNotes(app, [...notes, { id, text }]);
  }),

  updateNote: (params, app) => inOrder(async () => {
    const text = textFrom(params);
    const notes = await readNotes(app);
    if (!notes.some((n) => n.id === params.id)) throw new Error('That note no longer exists.');
    return saveNotes(app, notes.map((n) => (n.id === params.id ? { ...n, text } : n)));
  }),

  deleteNote: (params, app) => inOrder(async () => {
    const notes = await readNotes(app);
    if (!notes.some((n) => n.id === params?.id)) throw new Error('That note no longer exists.');
    return saveNotes(app, notes.filter((n) => n.id !== params.id));
  }),
};
```

## the page {#page}

Replace the three files in `src/frontend/`:

::: code-group

```html [index.html]
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Notes</title>
  <link rel="stylesheet" href="style.css">
  <script src="app.js" defer></script>
</head>
<body>
  <main>
    <h1>Notes</h1>
    <form id="editor">
      <fieldset id="controls" disabled>
        <textarea id="text" rows="5" maxlength="2000" required
                  placeholder="Write a note…"></textarea>
        <button id="save" type="submit">Add note</button>
        <button id="cancel" type="button" hidden>Cancel</button>
      </fieldset>
    </form>
    <p id="status" role="status">Loading…</p>
    <p id="error" role="alert"></p>
    <ul id="notes"></ul>
    <p id="empty" hidden>No notes yet.</p>
  </main>
</body>
</html>
```

```js [app.js]
const $ = (id) => document.getElementById(id);
let editing = null; // the id of the note being edited, if any
let busy = false;

function resetEditor() {
  editing = null;
  $('text').value = '';
  $('save').textContent = 'Add note';
  $('cancel').hidden = true;
}

function render(notes) {
  $('notes').replaceChildren();
  $('empty').hidden = notes.length > 0;
  for (const note of notes) {
    const item = document.createElement('li');
    const text = document.createElement('p');
    text.textContent = note.text; // a note is text, never HTML
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.onclick = () => {
      editing = note.id;
      $('text').value = note.text;
      $('save').textContent = 'Save changes';
      $('cancel').hidden = false;
      $('text').focus();
    };
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.onclick = () => run(async () => {
      render(await tiny.api.call('deleteNote', { id: note.id }));
      if (editing === note.id) resetEditor();
    }, 'Deleted.');
    item.append(text, edit, remove);
    $('notes').append(item);
  }
}

// One call at a time, with the controls off while it runs. A backend error
// arrives as its message, a plain string.
async function run(step, done) {
  if (busy) return;
  busy = true;
  $('controls').disabled = true;
  $('error').textContent = '';
  $('status').textContent = 'Working…';
  try {
    await step();
    $('status').textContent = done;
  } catch (err) {
    $('error').textContent = typeof err === 'string' ? err : err.message;
    $('status').textContent = 'Not saved — your text is still in the editor.';
  } finally {
    busy = false;
    $('controls').disabled = false;
  }
}

$('editor').onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    const method = editing ? 'updateNote' : 'addNote';
    render(await tiny.api.call(method, { id: editing, text: $('text').value }));
    resetEditor();
  }, 'Saved.');
};
$('cancel').onclick = resetEditor;

run(async () => render(await tiny.api.call('listNotes')), 'Ready.');
```

```css [style.css]
:root { font: 16px/1.5 system-ui, sans-serif; color-scheme: light dark; }
body { margin: 0; }
main { max-width: 40rem; margin: auto; padding: 1.5rem; }
fieldset { border: 0; margin: 0; padding: 0; }
textarea { box-sizing: border-box; width: 100%; padding: .6rem; font: inherit; }
button { font: inherit; margin: .5rem .5rem 0 0; }
#notes { list-style: none; padding: 0; }
#notes li { border-top: 1px solid #8884; padding: .75rem 0; }
#notes p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
#error { color: #c33; }
```

:::

## run it {#run}

```sh
tinyjs dev
```

Add a note, edit it, delete one. Then quit and run `tinyjs dev` again: the notes are still there.

While `tinyjs dev` runs, saving a file in `src/frontend/` reloads the page, and saving the backend restarts it — text you haven't saved yet goes with it.

## how it fits together {#how}

**The page asks, the backend does.** `tiny.api.call('addNote', { text })` sends the call to the backend's `api.addNote`, and the list it returns comes back as the result. Anything that crosses — parameters and results — is plain JSON. The page has no file system of its own; everything that touches the computer happens in the backend. See [calling the backend](./api).

**Errors come back as text.** When `textFrom` throws, the page's `await` rejects with the message as a plain string, which is why `run()` checks `typeof err === 'string'`. Try saving an empty note.

**Notes are text, not HTML.** `render()` sets `textContent`, so a note containing `<b>hello</b>` shows exactly that, and nothing a user types can run as code.

**One change at a time.** `inOrder` makes each read-change-write finish before the next starts, so two quick saves can't both start from the same list and drop a note.

## where the notes are saved {#data}

`app.store` saves to `store.json` in the app's own data folder, named after its `id`:

| | |
|---|---|
| macOS | `~/Library/Application Support/com.yourname.notes/` |
| Windows | `%APPDATA%\com.yourname.notes\` |
| Linux | `~/.local/share/com.yourname.notes/` |

`(await app.paths()).data` gives the folder from the backend; `tiny.app.paths()` from the page. `tinyjs dev` and a built copy with the same id share it — and changing the id starts with an empty notebook rather than moving the old one.

A save that fails (a full disk, no permission) doesn't throw: `store.set` resolves `false`, which is why `saveNotes` checks it and only then updates `savedNotes` — so retrying a failed add can't add the note twice. See [when a save fails](./store#failures). For more than a list of notes, the backend has [SQLite](./sqlite) built in.

## make it feel like a desktop app {#desktop}

The notebook works, but nothing in it needs a desktop yet. Five small additions change that — each one is independent, so add any of them.

### 1. export to a file {#export}

A browser tab can't write a file wherever you choose; your backend can. The page asks where with the native save dialog, then hands the path to the backend, which writes the notes as Markdown. Add this to the `api` object in `src/backend/main.js`:

```js
  exportNotes: (params, app) => inOrder(async () => {
    if (typeof params?.path !== 'string') throw new Error('No file was chosen.');
    const notes = await readNotes(app);
    const markdown = notes.map((n) => n.text).join('\n\n---\n\n') + '\n';
    await tjs.writeFile(params.path, new TextEncoder().encode(markdown));
    return true;
  }),
```

…and this to the end of `src/frontend/app.js`:

```js
async function exportNotes() {
  const path = await tiny.dialog.saveFile({ types: ['md'], name: 'notes' });
  if (path) run(() => tiny.api.call('exportNotes', { path }), 'Exported to ' + path);
}
```

`saveFile` only asks — it resolves the chosen path, or `null` if the user cancels, and writes nothing. See [dialogs](./dialogs#save).

### 2. a menu with shortcuts {#menu}

Desktop apps put their commands in the menu bar, with keyboard shortcuts. Add to the end of `app.js`:

```js
tiny.menu.set([
  { title: 'File', items: [
    { id: 'new', label: 'New Note', key: 'n' },
    { id: 'export', label: 'Export…', key: 'e' },
  ]},
]);

tiny.menu.on((id) => {
  if (id === 'new') { resetEditor(); $('text').focus(); }
  if (id === 'export') exportNotes();
});
```

`key: 'n'` is ⌘N on a Mac and Ctrl+N on Windows and Linux. On macOS the menu goes in the menu bar after the app and Edit menus tinyjs adds for you; on Windows and Linux it's drawn under the window's title bar. See [menus](./menus).

### 3. confirm before deleting {#confirm}

Delete removes a note with one click. Ask first, with the system's own dialog — in `render()`, replace the `remove.onclick = …` lines with:

```js
    remove.onclick = async () => {
      const sure = await tiny.dialog.confirm('Delete this note?', {
        detail: note.text.slice(0, 100),
        ok: 'Delete',
      });
      if (!sure) return;
      run(async () => {
        render(await tiny.api.call('deleteNote', { id: note.id }));
        if (editing === note.id) resetEditor();
      }, 'Deleted.');
    };
```

### 4. remember the window {#remember}

One line in `tinyjs.json`, and the window opens where the user left it — same size, same place, same screen:

```json
  "rememberWindows": true
```

See [`rememberWindows`](./config#rememberWindows).

### 5. the count in the title bar {#title}

At the end of `render()`:

```js
  tiny.win.setTitle(notes.length ? `Notes (${notes.length})` : 'Notes');
```

The [window](./window) page has the rest of what a window can do.

## build and share it {#build}

Quit the dev app, then:

```sh
tinyjs build
```

::: tabs
== macOS
`dist/Notes.app` is the app. Copy it anywhere and open it.

It's signed ad-hoc, which is fine on your own Mac; on someone else's, Gatekeeper blocks it until it's signed with a Developer ID and notarized — see [notarize](./cli#notarize).
== Windows
Send the whole `dist\` folder: `notes.exe` needs the files beside it. Unsigned, Windows shows a warning the first time it runs.
== Linux
Send the whole `dist/` folder: `notes` needs the files beside it. The person running it needs WebKitGTK 4.1 — see [install](./install).
:::

Build on each OS you want to ship for. Saved notes stay in the data folder on each computer — they aren't part of the build.

## next {#next}

- [`tinyjs.json`](./config) — window size, an icon, a menu bar app, file types.
- [window](./window), [menus](./menus), [dialogs](./dialogs), [notifications](./notifications) — the rest of what a desktop app does.
- [auto-update](./auto-update) — ship new versions to people who already have it.
