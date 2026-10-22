---
title: "menus"
---

# menus

<p class="tagline">tiny.menu — the menu bar and right-click menus</p>

`tiny.menu` declares your app's menu bar and replaces the right-click menu with native items. You describe menus as plain arrays of items, and clicks come back as the item's `id`. The same item shape is used by the [tray](./tray) menu.

```js
await tiny.menu.set([
  { title: 'File', items: [
    { id: 'new', label: 'New Note', key: 'n' },
    { id: 'open', label: 'Open…', key: 'o' },
    { separator: true },
    { id: 'export', label: 'Export as PDF…', key: 'E' },
  ]},
]);

tiny.menu.on((id) => {
  if (id === 'new') newNote();
});
```

The backend has the same calls on `app.menu` — `app.menu.set()`, `app.menu.update()`, `app.menu.get()`, `app.menu.setContext()` — and gets clicks through the [`onMenu(id, app)` and `onContextMenu(id, app)` hooks](./backend#hooks). Setting it from the backend's [`init`](./backend#init) puts it up at startup, whether or not a page has loaded yet.

## the menu bar {#menu-bar}

```js
await tiny.menu.set(menus)    // menus: [{ title, items }]
```

This is the **app** menu: every window shows it, including windows opened later. Each call replaces the whole menu; `tiny.menu.set([])` removes yours.

- **macOS** has one menu bar for the whole app, at the top of the screen. Every app gets an application menu (About, Quit ⌘Q) and an Edit menu (Undo, Cut, Copy, Paste, Select All) for free; yours follow them. The Edit menu is what makes ⌘C and ⌘V work in the page.
- **Windows and Linux** draw a copy of the menu bar inside each window, under the title bar. There is no application menu and no automatic Edit menu — the webview handles Ctrl+C and Ctrl+V on its own. When a bar first appears, the window grows to make room for it, so the page keeps its [`size`](./config#size) (a maximized window gives the row up from the page instead).

On Windows, frameless and transparent windows can't show a menu bar. Their menu's shortcuts still work.

To give one window a different menu, see [one window's menu](#per-window).

## menu items {#items}

```js
{ title: 'View', items: [
  { id: 'sidebar', label: 'Show Sidebar', key: 's', checked: true },
  { id: 'zoom', label: 'Zoom', submenu: [
    { id: 'zoom-in', label: 'Zoom In', key: 'alt+i' },
    { id: 'zoom-out', label: 'Zoom Out', key: 'alt+o' },
  ]},
  { separator: true },
  { id: 'sync', label: 'Sync Now', enabled: false },
]}
```

| field | | |
|---|---|---|
| `id` | string | what a click reports; also how [`update`](#update) and [`get`](#update) find the item |
| `label` | string | the text shown; defaults to `id` |
| `key` | string | keyboard shortcut — see [shortcuts](#keys) |
| `checked` | boolean | shows a checkmark |
| `enabled` | boolean | `false` greys the item out |
| `submenu` | item[] | a nested menu; the item itself only opens it |
| `separator` | `true` | a divider line; other fields are ignored |
| `role` | string | a stock editing item instead of your own — see [the Edit menu](#edit) |

Item ids should be unique across all your menus: [`update`](#update) changes every item with that id.

## keyboard shortcuts {#keys}

`key` is the character pressed together with ⌘ on macOS, or Ctrl on Windows and Linux. ⌘/Ctrl is always part of it — a menu shortcut without it isn't possible.

| `key` | macOS | Windows, Linux |
|---|---|---|
| `'s'` | ⌘S | Ctrl+S |
| `'S'` | ⌘⇧S | Ctrl+Shift+S |
| `'alt+p'` | ⌥⌘P | Ctrl+Alt+P |
| `'alt+shift+f'` | ⌥⇧⌘F | Ctrl+Alt+Shift+F |
| `'ctrl+k'` | ⌃⌘K | Ctrl+K |

An uppercase letter carries its own Shift. Prefixes add the rest: `alt` (or `opt`, `option`), `shift`, and `ctrl` (or `control`), which adds ⌃ on macOS and changes nothing elsewhere. `cmd`, `command`, `meta` and `super` are accepted and change nothing, since ⌘/Ctrl is always there.

Use a letter or a digit for a shortcut that works everywhere. macOS takes any single character — `','` for Settings… is ⌘, — but Windows only fires shortcuts on letters and digits, and Linux reads the key as a GTK key name (`'comma'` rather than `','`). Shortcuts keep working in a window whose bar is [hidden](#per-window).

## handling clicks {#clicks}

```js
const off = tiny.menu.on((id) => { … });   // returns an unsubscribe function
```

```js
// backend
export function onMenu(id, app) {
  if (id === 'new') app.window('main').show();
}
```

A click reaches the backend's `onMenu` and every page's `tiny.menu.on` listener — in every open window, whichever window's bar was clicked. If several windows each subscribe, each one runs. For commands that act on the whole app, handle them once: in the backend, or in one window.

## changing items {#update}

```js
await tiny.menu.update(id, { label?, checked?, enabled? })
await tiny.menu.get(id)   // → { exists, label?, checked?, enabled? }
```

`update` changes a live item without declaring the menu again. Fields you leave out stay as they are, and every copy of the id moves — in every window's bar, the tray menu and the right-click menu.

```js
let muted = false;
tiny.menu.on(async (id) => {
  if (id !== 'mute') return;
  muted = !muted;
  await tiny.menu.update('mute', { checked: muted, label: muted ? 'Unmute' : 'Mute' });
});

await tiny.menu.get('mute');   // { exists: true, label: 'Unmute', checked: true, enabled: true }
await tiny.menu.get('nope');   // { exists: false }
```

`get` reads an item back from the menu bar or the tray menu, and on macOS and Windows from the right-click menu too. An `update` for an id that doesn't exist does nothing. An empty `label` leaves the label unchanged.

## standard menus {#roles}

A menu with a `role` instead of a `title` takes a slot that the launcher fills.

| role | macOS | Windows, Linux |
|---|---|---|
| `'app'` | your items inside the application menu, between About and Quit | dropped |
| `'edit'` | the Edit menu, at this position in the bar | an "Edit" menu of your items, if you give any |
| `'help'` | the Help menu, always last | a "Help" menu of your items, in this position |

Only the first `'app'` block and the first `'edit'` block count.

### the application menu {#app}

On macOS, Settings… belongs in the application menu, between About and Quit. Put it there with `{ role: 'app' }`. Windows and Linux have no application menu and drop these items, so declare the same item in a menu of your own for them.

```js
const settings = { id: 'settings', label: 'Settings…', key: ',' };
const isMac = tiny.system.isMacOS();

await tiny.menu.set([
  { role: 'app', items: [settings] },
  { title: 'File', items: [
    { id: 'new', label: 'New', key: 'n' },
    ...(isMac ? [] : [{ separator: true }, { ...settings, key: undefined }]),
  ]},
]);
```

Items in the application menu work like any other: they report clicks through `tiny.menu.on` and `onMenu`, and `update` and `get` find them. The `key` is dropped on Windows and Linux above because those only fire shortcuts on letters and digits.

### the Edit menu {#edit}

On macOS the Edit menu is always there and comes right after the application menu. Declare `{ role: 'edit' }` to move it — that's how you get File before Edit, the usual Mac order. Items you give it go below Select All.

```js
await tiny.menu.set([
  { title: 'File', items: [{ id: 'save', label: 'Save', key: 's' }] },
  { role: 'edit', items: [{ id: 'find', label: 'Find…', key: 'f' }] },
]);
```

On Windows and Linux, `{ role: 'edit' }` with items draws an "Edit" menu of exactly those items in that slot, and without items draws nothing.

#### stock items {#stock}

To control the Edit menu's contents, place the stock items yourself with an item-level `role`:

| item `role` | |
|---|---|
| `'undo'` | Undo |
| `'redo'` | Redo |
| `'cut'` | Cut |
| `'copy'` | Copy |
| `'paste'` | Paste |
| `'selectAll'` | Select All |
| `'standard'` | all six, in that order, with a separator after Redo |

As soon as you place one, you set the whole order and macOS adds none of its own. Stock items render on all three OSes, so this gives the same Edit menu everywhere:

```js
{ role: 'edit', items: [{ role: 'standard' }, { separator: true }, { id: 'find', label: 'Find…', key: 'f' }] }
```

Stock items act on whatever has focus in the page and grey out when they don't apply (on Windows they're always enabled). They work in the menu bar and in [right-click menus](#context); the tray skips them.

On macOS, `standard: false` on the menu drops the stock items. With no items of your own as well, there's no Edit menu at all. ⌘C, ⌘V, ⌘X, ⌘A and ⌘Z keep working either way.

```js
{ role: 'edit', standard: false, items: [{ id: 'find', label: 'Find…', key: 'f' }] }
```

### the help menu {#help}

```js
{ role: 'help', items: [{ id: 'site', label: 'Visit Website' }] }
```

On macOS the Help menu always goes last, and macOS puts its menu-search field at the top. When a built app ships a [help book](./config#helpBook), the menu starts with "&lt;App&gt; Help" (⌘?), which opens the book, and your items go below it; `standard: false` drops that item. A help book gets a Help menu even without the role. In `tinyjs dev` there's no help book, so the menu holds only your items.

On Windows and Linux it's a plain "Help" menu of your items, in the position you declared it.

### a custom About panel {#about}

On macOS the application menu's About item shows the standard About panel. With [`"about": "menu"`](./config#about) in tinyjs.json, it sends a menu click with the reserved id `'about'` instead — to `onMenu('about')` and `tiny.menu.on` — so you can show your own.

```json
{ "about": "menu" }
```

```js
tiny.menu.on((id) => {
  if (id === 'about') tiny.win.open('about', { page: 'about.html', title: 'About', size: '360x240' });
});
```

Windows and Linux have no built-in About item, so there's nothing to hook; add your own, such as in the Help menu.

## one window's menu {#per-window}

```js
await tiny.win.menu.set(menus)        // this window's own bar
await tiny.win.menu.update(id, patch) // only this window's copy
await tiny.win.menu.get(id)
await tiny.win.menu.reset()           // back to the app menu
```

`tiny.win.menu` gives the calling window its own menu bar, with the same spec and the same click events as `tiny.menu`. Windows that don't override keep the app menu. On macOS, which has one bar, the window's menu is shown while that window is focused and the app menu returns when it isn't.

`tiny.win.menu.update` patches the item in this window only; `tiny.menu.update` patches every window's copy. In the backend, the same calls are `app.win.menu.*` for the main window and `app.window(id).menu.*` for others.

To show no menu bar in one window, hide it rather than emptying it: `tiny.win.setChrome({ menu: false })`, or `"chrome": { "menu": false }` in [tinyjs.json](./config#chrome) or [`win.open`](./multiple-windows). The window's shortcuts keep working. macOS ignores it, since its one bar belongs to the whole app.

## right-click menus {#context}

```js
await tiny.menu.setContext(items)   // items, or null for the default menu
tiny.menu.onContext((id) => { … })  // returns an unsubscribe function
```

`setContext` replaces the webview's right-click menu (Reload, Inspect Element…) with your items, in every window. Items have the same fields as menu bar items, including submenus and [stock items](#stock). `null` or `[]` brings the default menu back. Clicks go to `tiny.menu.onContext` and the backend's `onContextMenu(id, app)` hook.

```js
await tiny.menu.setContext([
  { id: 'copy-link', label: 'Copy Link' },
  { separator: true },
  { role: 'paste' },
]);

let target = null;
document.addEventListener('contextmenu', (e) => { target = e.target; });
tiny.menu.onContext((id) => {
  if (id === 'copy-link' && target?.closest('a')) copyLink(target.closest('a').href);
});
```

The click reports only the item's id. To act on what was right-clicked, remember the target in a `contextmenu` listener, as above.

To turn off the default menu without replacing it, set [`"contextMenu": false`](./config#contextMenu) in tinyjs.json. A custom menu from `setContext` still shows.

## old names {#deprecated}

The backend's earlier spellings still work but log a deprecation notice once: `app.setMenu()`, `app.updateMenuItem()`, `app.getMenuItem()` and `app.setContextMenu()` are now `app.menu.set()`, `.update()`, `.get()` and `.setContext()`; a window handle's `setMenu()`, `resetMenu()`, `updateMenuItem()` and `getMenuItem()` are now `menu.set()`, `.reset()`, `.update()` and `.get()`.
