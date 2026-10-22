---
title: "keystrokes"
---

# keystrokes

<p class="tagline">tiny.app.keystroke — send key presses to other apps</p>

`tiny.app.keystroke` presses a key combination as if the user had typed it, and `tiny.app.paste` presses the paste shortcut. The keys go to whichever app is in front, which makes them the last step of a clipboard manager, a snippet expander or an emoji picker: put text on the [clipboard](./clipboard), hide your window, paste.

```js
await tiny.clipboard.write({ text: snippet });
await tiny.win.hide();
const { ok, trusted } = await tiny.app.paste();
```

The backend has the same calls: `app.keystroke(combo)` and `app.paste()`.

## keystroke {#keystroke}

```js
await tiny.app.keystroke(combo)   // → { ok, trusted }
```

`combo` is modifiers and one key joined with `+`, the same names as [hotkeys](./hotkeys#combos): `'cmd+v'`, `'cmd+shift+z'`, `'escape'`, `'alt+tab'`. The launcher presses the modifiers, presses and releases the key, then releases the modifiers. `cmd` is Ctrl on Windows and Linux, so `'cmd+v'` pastes on all three.

It posts one combination, not text — there's no call that types a string. To enter text, put it on the clipboard and paste.

The promise resolves `{ ok, trusted }`; it doesn't reject.

| | `ok` | `trusted` |
|---|---|---|
| macOS | the key was posted: the combo parsed and Accessibility is granted | Accessibility is granted |
| Windows | the combo parsed and Windows accepted the input | always `true` |
| Linux | the combo parsed and was posted through XTest (always `false` in a Wayland session) | same as `ok` |

On Windows, `ok: true` means Windows accepted the input, not that the target app acted on it: Windows silently drops input sent to an app running as administrator from one that isn't.

## paste into another app {#paste}

```js
await tiny.app.paste()   // → { ok, trusted }
```

`paste()` is `keystroke('cmd+v')`. The paste lands in the app in front, so make that the right app first. On macOS, [`tiny.win.hide()`](./window) hides the whole app and focus goes back to the app the user was in before, with no need to track which one it was:

```js
async function insert(text) {
  await tiny.clipboard.write({ text });
  await tiny.win.hide();
  const r = await tiny.app.paste();
  if (!r.trusted) showAccessibilityHelp();
}
```

## the Accessibility permission (macOS) {#permissions}

macOS only lets an app post keystrokes once the user has granted it Accessibility in System Settings → Privacy & Security. The keystroke comes from the launcher itself, so the prompt and the settings entry name your app, and one grant covers it — instead of the two that scripting System Events through osascript needs, which name osascript or the terminal.

Without the grant, `keystroke` resolves `{ ok: false, trusted: false }` and nothing is typed. Ask before the first use rather than failing at it, with [`tiny.app.permissions`](./permissions):

```js
if (tiny.system.isMacOS() && await tiny.app.permissions.check('accessibility') !== 'granted') {
  await tiny.app.permissions.request('accessibility');   // opens System Settings at your app
}
```

In `tinyjs dev` the grant belongs to the shared dev launcher rather than your app — see [permissions](./permissions).

## platform support {#platforms}

- **macOS**: needs Accessibility, as above.
- **Windows**: no permission needed.
- **Linux**: synthesised through XTest, so it works in X11 sessions. Wayland doesn't let apps fake input, so in a Wayland session the keys can't reach Wayland apps. In a Wayland session `keystroke()` and `paste()` don't send anything and answer `{ ok: false, trusted: false }`.

To check before offering the feature, ask [`tiny.system.capabilities()`](./portability): `keystroke` is `false` on Linux when the session isn't X11, and supported everywhere else.

```js
const caps = await tiny.system.capabilities();
if (caps.keystroke !== false) enableQuickPaste();
```
