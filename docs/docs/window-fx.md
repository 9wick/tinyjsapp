---
title: "window fx"
---

# window fx

<p class="tagline">tiny.win — overlays, HUDs, desktop pets</p>

Most windows sit in the normal stack and take clicks. These calls change that, for windows that aren't documents: a drawing overlay that lets clicks through, a HUD that floats over full-screen apps, a pet that lives on the wallpaper, a palette that follows the user to every Space. Like the rest of [`tiny.win`](./window), each acts on the calling page's window, and the backend has them as `app.win.*` and `app.window(id).*`.

```js
// a see-through overlay that never gets in the way
await tiny.win.setChrome({ frame: false, transparent: true });
await tiny.win.setLevel('overlay');
await tiny.win.setClickThrough(true);
await tiny.win.show({ activate: false });
```

## click-through {#clickThrough}

`setClickThrough(true)` lets mouse events pass through the window to whatever is behind it. Pair it with a transparent window for annotations or a heads-up display.

The window can't be clicked any more — including on a button meant to turn click-through off. Keep a way back that isn't in the window: a [hotkey](./hotkeys), a [tray](./tray) item or a menu item.

On Windows only the main window can be click-through. `getState().clickThrough` reads it back.

## window levels {#level}

```js
tiny.win.setLevel('floating');
```

`setLevel(level)` puts the window in a band of the stack:

| level | |
|---|---|
| `'normal'` | an ordinary window |
| `'floating'` | above other apps' ordinary windows — the same as `setAlwaysOnTop(true)` |
| `'overlay'` | on macOS, above nearly everything, including full-screen apps and Mission Control. Windows and Linux have only one band above normal, so there it's the same as `'floating'`. |
| `'desktop'` | below ordinary windows, on the wallpaper |

To keep a window above just your own main window, not other apps, open it with [`parent`](./multiple-windows#parent) instead.

On macOS, Mission Control follows from these: `'normal'` and `'floating'` windows show up in it like any document, while `'desktop'`, `'overlay'` and click-through windows stay out of it and out of the window cycle.

## every Space {#allSpaces}

```js
tiny.win.setAllSpaces(true);
```

`setAllSpaces(true)` keeps the window on every Space (virtual desktop) as the user switches, and on macOS lets it appear over full-screen apps. It works on macOS and X11. Windows has no equivalent and ignores it (`tiny.system.capabilities().setAllSpaces` is `false`), and Wayland has none either.

## showing without focus {#activate}

`show({ activate: false })` puts a window on screen without taking keyboard focus from the app the user is typing in — for a HUD or a toast. Clicking the window activates it normally. See [showing and hiding](./window#visibility).

## building blocks elsewhere {#elsewhere}

Overlays, HUDs and menu-bar monitors usually combine these with calls documented on other pages:

- **a window under the tray icon** — [`tiny.tray.position()`](./tray#position), in the same coordinates as `setPosition`.
- **a live app icon** — [`tiny.app.icon(path)`](./shell#app-surface), for a progress ring or a status tile.
- **battery and Wi-Fi** — [`tiny.system.battery()`](./system#battery) and [`tiny.system.wifi()`](./system#wifi).
- **other apps' windows and selected text** — [`tiny.macos.otherWindows()`, `moveWindow()` and `selectedText()`](./macos-only#other-apps), for window managers and PopClip-style popovers.
- **on-device AI** — [`tiny.macos.ai`](./macos-only#ai).
