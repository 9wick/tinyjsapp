---
title: "hotkeys"
---

# hotkeys

<p class="tagline">tiny.hotkey — system-wide keyboard shortcuts</p>

`tiny.hotkey` registers a key combination that fires wherever the user is — while another app is in front, or while your window is hidden. Use it to summon a palette, toggle recording, or show a menu-bar app's window. For shortcuts that only matter while your app is focused, use a [menu item's `key`](./menus#keys) or a `keydown` listener instead, which don't take the combination away from every other app.

```js
await tiny.hotkey.register('summon', 'cmd+shift+space');
tiny.hotkey.on((id) => {
  if (id === 'summon') tiny.win.show();
});
```

The backend has the same calls on `app.hotkey` — `app.hotkey.register()` and `app.hotkey.unregister()` — and gets presses through the [`onHotkey(id, app)` hook](./backend#hooks). A hotkey that should work with no window open belongs there:

```js
// backend
export function init(app) {
  app.hotkey.register('summon', 'cmd+shift+space');
}

export function onHotkey(id, app) {
  if (id === 'summon') app.win.show();
}
```

## registering {#register}

```js
await tiny.hotkey.register(id, combo)
await tiny.hotkey.unregister(id)
const off = tiny.hotkey.on((id) => { … })   // returns an unsubscribe function
```

`id` is your name for the hotkey; presses report it. `combo` is modifiers and one key joined with `+`, such as `'cmd+shift+k'` — see [combos](#combos).

Registering an id that's already registered replaces its combo, so a settings screen can rebind a hotkey by calling `register` again. `unregister` removes it. Hotkeys last until the app quits.

A press reaches the backend's `onHotkey` and every open window's `tiny.hotkey.on` listeners. If several windows subscribe, each one runs.

`register()` resolves `true` once the system has the hotkey, and `false` when it doesn't — the combo isn't valid, or another app already holds it. The reason is logged to the console (`tinyjs: hotkey "…" not registered: …`), visible in `tinyjs dev`. Pick combos unlikely to clash, let users change them, and tell them when one couldn't be registered:

```js
if (!(await tiny.hotkey.register('summon', 'cmd+shift+space')))
  showMessage('That shortcut is already used by another app — pick another one.');
```

On Linux under Wayland, `true` means the hotkey was handed to the desktop, which then asks the user to approve it (see [platform notes](#platforms)).

## combos {#combos}

A combo is modifiers plus exactly one key, joined with `+`, in any order. Names are case-insensitive. A combo with an unknown word, two keys or no key is refused — never registered as something else.

| modifier | macOS | Windows, Linux |
|---|---|---|
| `cmd`, `command`, `meta` | ⌘ | Ctrl |
| `ctrl`, `control` | ⌃ | Ctrl |
| `alt`, `opt`, `option` | ⌥ | Alt |
| `shift` | ⇧ | Shift |
| `win`, `super` | ⌘ | the Windows / Super key |

`cmd` and `ctrl` are the same key on Windows and Linux, so `'cmd+shift+k'` is ⌘⇧K on a Mac and Ctrl+Shift+K elsewhere.

macOS has no separate Windows key, so `win` and `super` mean ⌘ there, as they do in [menus](./menus#keys).

Keys have the same names on every OS:

| key | names |
|---|---|
| letters and digits | `a`–`z`, `0`–`9` |
| function keys | `f1`–`f12` everywhere; up to `f20` on macOS, `f24` on Windows, `f35` on Linux |
| whitespace and editing | `space`, `tab`, `return` (or `enter`), `escape` (or `esc`), `backspace` (or `delete`), `forwarddelete` |
| arrows and navigation | `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown` |
| punctuation | `minus`, `equal`, `comma`, `period`, `slash`, `semicolon`, `quote`, `backslash`, `grave`, `bracketleft`, `bracketright` — or the character itself: `'cmd+,'`, `'ctrl+/'` |

`delete` is Backspace on every OS — the key labelled Delete on a Mac; use `forwarddelete` for the other one. Punctuation names are the keys' positions on a US layout. The same names are used by [keystrokes](./keystrokes).

## platform notes {#platforms}

- **macOS**: no permission is needed — registering a hotkey doesn't involve Accessibility. The combo is taken from every other app while registered.
- **Windows**: a combo another app has already registered can't be taken; the console says so. Holding the keys down doesn't repeat the event.
- **Linux, X11**: the launcher grabs the key on the root window. An app that runs through XWayland (see [`windowPlacement`](./config#windowPlacement)) takes this route too, not the portal below.
- **Linux, Wayland**: apps can't grab keys there, so tinyjs asks the desktop through the GlobalShortcuts portal. The desktop shows the user a dialog to approve the shortcuts — listed as "&lt;App&gt;: &lt;id&gt;", so give hotkeys readable ids — and may let them pick a different combo; your combo is only a suggestion. Desktops without the portal never fire the hotkey.

[`tiny.system.capabilities()`](./portability) reports `globalHotkeys: false` on a Linux Wayland desktop without the GlobalShortcuts portal, where hotkeys can't fire; `tiny.system.requirements(['globalHotkeys'])` says what to install.
