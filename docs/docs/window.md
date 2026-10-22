---
title: "window"
---

# window

<p class="tagline">tiny.win — window control</p>

`tiny.win` controls the window the page lives in: its size and place on screen, whether it's shown, full screen or on top, how it looks (title bar, translucency), and what happens inside it (drag regions, file drops, find, print). Every window runs its own copy, so a call from a settings window moves the settings window. Opening more windows is on [multiple windows](./multiple-windows); overlays, HUDs and window levels are on [window fx](./window-fx).

The [backend](./backend) has the same calls under the same names: `tiny.win.setSize()` in a page is `app.win.setSize()` for the main window, and `app.window(id).setSize()` for any other. The page versions return promises; most backend window calls return nothing, and `getState()` and `printToPDF()` return promises on both sides. The [API map](./api-map#win) lists both sides.

```js
await tiny.win.setTitle('Untitled — Notes');
await tiny.win.setSize(900, 600);
await tiny.win.center();
const { width, height, focused } = await tiny.win.getState();
```

## size and position {#position}

```js
tiny.win.setSize(900, 600);          // the page's box, top-left stays put
tiny.win.setPosition(40, 40);        // the window's top-left, in screen points
tiny.win.center();
tiny.win.setMinSize(640, 480);       // floor under the user's resizes
```

- **`setSize(width, height, opts?)`** sizes the *page* — the area your HTML gets, without the title bar or (on Windows and Linux) the menu bar. It's the same box as [`size`](./config#size) in tinyjs.json, `win.open`'s `size: '900x600'`, and `getState().width`/`height`, so reading the size and setting it back changes nothing. The top-left corner stays where it is. `{ units: 'px' }` takes pixels of the screen the window is on instead of points.
- **`setPosition(x, y, opts?)`** moves the window's top-left corner (the frame, title bar included). Coordinates are points with the origin at the top-left of the primary screen and y growing downward, the same space as `getState().x`/`y`, [`screens()`](#screens) and [`mousePosition()`](#cursor). With `{ screen }`, x and y are relative to that screen instead — see [placing on a screen](#on-a-screen).
- **`center()`** centres the window on its screen.
- **`setMinSize(width, height)`** stops the user resizing the page smaller than this; `win.open` takes the same as `minSize: '640x480'`. On macOS a window that's already smaller grows to fit. Your own `setSize` can still go below it on macOS and Windows; on Linux GTK holds both.

**Wayland** doesn't let an app place its own windows, so `setPosition` and `center` do nothing there. `getState().canPosition` is `false` in that case (it's only present on Linux), and `tiny.system.capabilities().windowPosition` says the same. An app that needs to place windows can set [`windowPlacement`](./config#windowPlacement) to run through XWayland instead. `setFullscreen(true, { screen })` is the one placement call Wayland honours.

### keeping windows on screen {#ensureOnScreen}

A saved position from a display that's since been unplugged points into empty space. tinyjs catches that: when the set of screens differs from the app's last run, each window's first show and first `setPosition` is checked, and a window with less than a sliver visible is moved onto the nearest screen. A display removed while the app runs is handled the same way for the windows on it. Ordinary moves are never touched, so a window you park half off-screen stays there.

```js
tiny.win.ensureOnScreen();   // pull this window back now if it can't be seen or grabbed
```

`ensureOnScreen()` runs the same check on demand. An app that parks windows off-screen on purpose sets [`offscreenRescue`](./config#offscreenRescue) to `false`, which turns off the automatic parts; `ensureOnScreen()` still works.

To have windows come back where the user left them — position, size, screen, maximized or full screen — set [`rememberWindows`](./config#rememberWindows) in tinyjs.json. No code is needed.

## screens {#screens}

```js
const screens = await tiny.app.screens();
const external = screens.find((s) => !s.internal) ?? screens[0];
```

`tiny.app.screens()` lists every display, in the same coordinate space as `setPosition`. Each entry:

| field | |
|---|---|
| `id` | a number for this session — what `captureScreen()` and screen recording take. It changes across reboots and replugs. |
| `uid` | the most stable identity the OS has: the display UUID on macOS, the monitor device path on Windows, the connector name (like `DP-1`) on Linux. Save this, not `id`. Identical monitors can still share one. |
| `name` | like `"Built-in Retina Display"`, or `null` |
| `x`, `y`, `width`, `height` | the display's frame, in points |
| `visible` | `{ x, y, width, height }`: the frame minus the menu bar, Dock or taskbar |
| `scale` | device pixels per point |
| `primary` | the menu-bar screen, whose top-left is the origin |
| `internal` | the laptop's built-in panel; `false` when the OS can't tell |
| `pixels` | `{ width, height, visible }`: the same screen in its own pixels; `visible` is relative to the screen |

Global coordinates are points on every OS, and they form one consistent space on Windows with mixed scaling too (a 100% monitor beside a 150% laptop). On Linux, `scale` is GTK's integer buffer scale: under fractional scaling (125%) it reads 1 or 2 depending on the compositor, not the user's setting, and `pixels` follow it.

To find a screen:

```js
await tiny.app.screenAt(x, y);                          // the screen containing a point, or null
await tiny.app.screenFor({ x, y, width, height });      // the one holding most of a rect, or null
await tiny.app.foregroundScreen();                      // the screen the user is working on
await tiny.app.matchScreen(saved);                      // a saved screen → the connected one, or null
```

- **`foregroundScreen()`** is the screen of the focused window of *any* app — where to open a palette — or the cursor's screen when that app shows no window. It needs no permission. It's `null` on Wayland.
- **`matchScreen(saved)`** takes a screen you stored earlier (a `screens()` entry) and returns the connected screen it most likely is now, or `null`. It scores `uid`, then name, resolution and scale, whether it's the built-in panel, and its place in the left-to-right order, since ids don't survive a replug or reboot.

`tiny.app.onScreensChanged(fn)` calls `fn(screens)` with the new list when a display is plugged in, unplugged, rearranged or rescaled, and returns an unsubscribe function. The backend gets `onSystem('screens', null, app)` — see [hooks](./backend#hooks).

### placing on a screen {#on-a-screen}

```js
const [, second] = await tiny.app.screens();
tiny.win.setPosition(40, 40, { screen: second });                 // 40 points from its top-left
tiny.win.setPosition(81, 81, { screen: second, units: 'px' });    // in its pixels
tiny.win.setFullscreen(true, { screen: second });                 // works on Wayland too
tiny.win.open('hud', { page: 'hud.html', screen: second, x: 40, y: 40 });
```

`screen` takes a `screens()` entry or its `id`. With `units: 'px'` the coordinates are that screen's pixels; there's no global pixel space (macOS doesn't have one), so `units: 'px'` without `screen` rejects. `getState()` reports the window back the same ways: `screenId` for the screen holding most of it, `local` for its top-left relative to that screen, and `pixels` for both in that screen's pixels.

On Windows with mixed scaling, WebView2's own `screen.availLeft` and `window.screenX` don't agree with these coordinates, and `screenX` goes stale after a move. If you drag a window by hand from `mousemove` events, use `clientX` deltas against `getState()`, not `e.screenX`.

## the cursor {#cursor}

```js
const { x, y, window, screen } = await tiny.app.mousePosition();
tiny.win.setPosition(x - 200, y + 12);        // open a palette at the mouse
```

`tiny.app.mousePosition()` resolves to:

- `x`, `y`: the cursor in global points, the same space as `setPosition`.
- `window`: `{ x, y, inside }` relative to this window's page, in `clientX`/`clientY` units, valid while the cursor is outside it too. The backend gets it relative to the main window.
- `screen`: `{ id, x, y, width, height, scale }` for the display the cursor is on.

On Wayland the compositor hides the cursor once it leaves your window, so the global position only tracks while it's over the app (`window.inside` goes `false` when it leaves). `tiny.app.mouseTracking.start()` gets real global coordinates there through the ScreenCast portal: the system shows a consent dialog the first time (the grant is remembered) and its screen-sharing indicator while tracking is on.

```js
try {
  await tiny.app.mouseTracking.start();   // { ok: true }
} catch (e) {
  console.log(e.code);                    // 'unsupported' | 'denied' | 'failed'
}
tiny.app.mouseTracking.stop();
```

On macOS, Windows and X11 the position is already global and `start()` resolves at once. On Linux, `tiny.system.capabilities().mousePosition` is `false` when `start()` is needed.

## showing and hiding {#visibility}

```js
tiny.win.hide();                       // hides the app; focus goes back to the previous one
tiny.win.hide({ app: false });         // just this window
tiny.win.show();                       // show and focus
tiny.win.show({ activate: false });    // show without taking focus
```

- **`hide(opts?)`** on the main window on macOS hides the whole app, and macOS hands focus back to the app that had it before. A palette can `hide()` and then paste into that app with no bookkeeping. `{ app: false }` puts away only this window and the app stays active. On Windows and Linux, and for other windows on macOS, `hide()` hides just the window either way.
- **`show(opts?)`** shows the window and brings it to the front with focus. `{ activate: false }` shows it without taking focus from the app the user is in — for HUDs and notifications.
- **`setHideOnClose(true)`** makes the main window's close button hide the window instead of quitting. On macOS the app keeps running and the Dock icon brings it back. Windows and Linux have nowhere to bring a hidden window back from, so there it holds only while something can: a [tray](./tray) icon, [`activation`](./config#activation) `"accessory"`, or another window still open. Otherwise closing the last window quits, as other apps on those systems do.

```js
tiny.win.minimize();
tiny.win.restore();             // un-minimize
tiny.win.zoom();                // maximize or un-maximize (the green button / title-bar double-click)
tiny.win.fullscreen();          // toggle
tiny.win.setFullscreen(true);   // or set it
tiny.win.setAlwaysOnTop(true);  // float above other apps' windows
tiny.win.setResizable(false);   // the user can't resize it; setSize still can
tiny.win.setTitle('Report.pdf');
```

- **Full screen** on macOS is the native kind, in its own Space. On Windows, only the main window goes full screen; other windows are maximized instead. `setFullscreen(true, { screen })` moves the window to that screen first.
- **`minimize()`** on Windows, for a window with no taskbar button (an `"accessory"` app's main window), hides it instead, since there's nowhere to minimize to.
- **`setAlwaysOnTop(true)`** is the same as `setLevel('floating')`; for the other levels see [window fx](./window-fx#level).

## reading the window {#state}

```js
const s = await tiny.win.getState();
if (s && !s.visible) tiny.win.show();
```

`getState()` resolves to `null` if the window has already closed, otherwise:

| field | |
|---|---|
| `x`, `y` | the window's top-left, in global points — what `setPosition` takes |
| `width`, `height` | the page's box — what `setSize`, `setMinSize` and `size` take |
| `outer` | `{ width, height }`: the footprint on screen, title bar included. The same as `width`/`height` for a frameless window. |
| `fullscreen`, `minimized`, `visible`, `focused` | booleans |
| `alwaysOnTop`, `resizable`, `clickThrough`, `allSpaces` | what you set |
| `level` | `'normal'`, `'floating'`, `'overlay'` or `'desktop'` |
| `chrome` | the current [chrome](#chrome): `frame`, `windowControls` (what's shown; `null` on Linux, which won't say), `transparent`, `vibrancy`, `squareCorners`, `acceptsFirstMouse`, `windowControlsPos` |
| `screen` | `{ width, height, scale }` of the screen the window is on |
| `screenId` | that screen's `id` in `screens()` |
| `local` | `{ x, y }`: the top-left relative to that screen |
| `pixels` | `{ x, y, width, height }`: `local` and the page's box in that screen's pixels |
| `canPosition` | Linux only: `false` on Wayland, where `setPosition` does nothing |

`window.outerWidth` and `window.outerHeight` are 0 in macOS's webview, so use `outer` to keep a window inside a screen.

### state changes {#onState}

Rather than poll, listen. `tiny.win.onState(fn)` fires when a window goes full screen, is maximized or minimized, gains or loses focus, or moves to another screen — whatever caused it: the green button, a menu item, F11, or your own call.

```js
const off = tiny.win.onState(({ win, fullscreen, maximized, minimized, focused, screenId }) => {
  if (win !== tiny.win.id) return;          // every window hears about every window
  document.body.classList.toggle('fullscreen', fullscreen);
});
off();                                      // unsubscribe
```

The event goes to every window, so check `win` (`'main'` or a `win.open` id). The backend gets the same object in `onWindowState(info, app)` — see [hooks](./backend#hooks). Wayland never reports `minimized`.

## chrome {#chrome}

`setChrome(opts)` changes how the window looks: no title bar, see-through, a blurred background, custom title-bar buttons. Set only the fields you want to change. To start that way with no flash of the default title bar, put the same fields in [`chrome`](./config#chrome) in tinyjs.json (main window) or in `win.open`'s `chrome` (other windows).

```js
tiny.win.setChrome({ frame: false, windowControls: false, vibrancy: 'hud' });
```

| field | | macOS | Windows | Linux |
|---|---|:-:|:-:|:-:|
| `frame` | `false`: no title bar; the page reaches the top edge. Resizing and focus keep working. Add a [drag region](#drag). | ✓ | ✓ | ✓ |
| `windowControls` | the close, minimize and maximize buttons: `true`, `false`, or a list such as `['close']` | ✓ | close always shows with the others | X11, best effort |
| `transparent` | see-through where the page's own background is transparent | ✓ | at open only | ✓ |
| `vibrancy` | a blurred material behind the page: `'sidebar'`, `'hud'`, `'menu'`, `'popover'`, `'window'`, `'content'`, `'header'`, `'sheet'`, `'tooltip'`, `'fullscreen'`, `'underwindow'`, `'underpage'`, `'titlebar'`, `'selection'`; `null` or `false` for none | ✓ | Windows 11: Acrylic for `hud`, `popover`, `menu`; Mica otherwise | — |
| `squareCorners` | `true`: a borderless window with square corners — no title bar or buttons, so add a [drag region](#drag). Resize edges and shadow stay. | ✓ | ✓ | ✓ |
| `acceptsFirstMouse` | `true`: the click that focuses an inactive window also reaches the page, instead of macOS swallowing it. For palettes, toolbars, and drag regions on inactive windows. | ✓ | — | already the default |
| `windowControlsPos` | `{ x, y }`: move the traffic lights, in points from the window's top-left — for a frameless window with a taller custom title bar. `null` puts them back. Set it once; it survives resizes and full screen. | ✓ | — | — |
| `menu` | `false`: this window shows no menu bar. Its shortcuts keep working and other windows keep theirs. | — (one bar per app) | ✓ | ✓ |

Fields a platform doesn't support are ignored. `tiny.system.capabilities()` reports `vibrancy`, `transparency` and `windowControls` per platform, and `getState().chrome` reads back what's set. Windows never draws a menu bar on a frameless or transparent window.

## drag regions and resizing {#drag}

A window without a title bar needs something to drag. Mark it in HTML:

```html
<header data-tiny-drag>
  <h1>Notes</h1>
  <button>New</button>          <!-- buttons, links and inputs still click -->
</header>
```

Pressing and dragging an element with `data-tiny-drag` moves the window, and double-clicking it zooms (maximizes), like a title bar. Buttons, links, inputs, selects, text areas, editable content and anything inside `data-tiny-nodrag` stay interactive.

To start a move or resize from your own code, call these from a `mousedown` handler while the button is still held — they take over the gesture in progress, and do nothing when called from a `click`:

```js
handle.addEventListener('mousedown', () => tiny.win.startDrag());
grip.addEventListener('mousedown', () => tiny.win.startResize('se'));
```

- **`startDrag()`** moves the window with the mouse.
- **`startResize(edge?)`** resizes from an edge: `'n'`, `'ne'`, `'e'`, `'se'` (the default), `'s'`, `'sw'`, `'w'` or `'nw'`. On macOS it does nothing after `setResizable(false)`.
- **`zoom()`** maximizes or restores, as a double-click on a title bar does.

Frameless windows keep the system's resize edges on macOS and Windows. On Linux, where an undecorated window has none, tinyjs adds invisible 5px grips on all eight edges; put `data-tiny-noresize` on `<html>` or `<body>` to leave them out, or make the window non-resizable.

## files in and out {#files}

Files dragged onto a window arrive as real filesystem paths:

```js
const off = tiny.win.onDrop((paths) => {
  for (const p of paths) openDocument(p);
});
```

The drop isn't tied to a window: every window's `onDrop` hears it, whichever window the files were dropped on.

To drag files *out* of the app — into Finder, Explorer, a chat app — call `startDrag({ files })` from a `mousedown` handler while the button is held:

```js
row.addEventListener('mousedown', () =>
  tiny.win.startDrag({ files: ['/Users/me/report.pdf'], image: '/tmp/drag.png' }));
```

`files` are real paths; `image` is an optional PNG to show under the cursor (file icons otherwise). `tiny.win.dragOut(opts)` is the same call. It works on macOS and Windows; the Linux launcher doesn't support dragging files out yet. This is page-only: the backend's `app.win.startDrag()` only moves the window.

## page zoom {#zoom}

```js
tiny.win.setZoom(2);
tiny.win.setSize(400 * 2, 300 * 2);    // a crisp "double size" mode
```

`setZoom(factor)` is the webview's own zoom, from 0.25 to 5. The page keeps laying out in CSS pixels and has fewer of them, rendered sharp. Pair it with `setSize` so the window grows with it. On macOS and Linux a factor outside 0.25–5 is ignored. This isn't `zoom()`, which maximizes.

## find in page {#find}

```js
const r = await tiny.win.find('needle', { forward: true, matchCase: false });
// { found: true, matches: 4, activeMatch: 1 }
await tiny.win.stopFind();
```

`find(term, opts?)` selects the next match and scrolls it into view; call it again to step through, with `forward: false` to go back. It's the search underneath a ⌘F bar — the bar itself is yours to draw. `matches` and `activeMatch` count matches; on macOS and Windows they come from a text walk in the page and are approximate on unusual pages (hidden text counts, shadow DOM doesn't), while Linux's come from the engine. `stopFind()` clears the selection. It works on all three platforms; `tiny.system.capabilities().findInPage` says so. [Site wrappers](./site-wrappers) use it for a wrapped site's ⌘F.

## print and PDF {#print}

```js
tiny.win.print();                                           // the system print dialog
const { path } = await tiny.win.printToPDF('/tmp/invoice.pdf');
```

- **`print()`** opens the print dialog for this window's page.
- **`printToPDF(path)`** renders this window's page to a vector PDF and resolves to `{ path }`, the file written; it rejects with the reason if that fails. From your own pages any path works. From a wrapped site, only the Downloads folder (a bare file name lands there), the app's data folder and the temp folder are written directly; any other path opens a save dialog with the name filled in, and cancelling rejects. On macOS the PDF is one tall page today; Windows and Linux split it into pages.

## share {#share}

```js
button.addEventListener('click', (e) =>
  tiny.win.share({ url: 'https://example.com', text: 'Look', x: e.clientX, y: e.clientY }));
```

`share(opts)` opens the macOS share sheet with `text`, a `url` and/or `paths` (real files), anchored at `x`, `y` in the page — pass the click's `clientX`/`clientY`. macOS only: Windows and Linux do nothing, and `tiny.system.capabilities().share` is `false` there.

## this window's menu bar {#menu}

`tiny.win.menu.set()`, `update()`, `get()` and `reset()` give one window a menu bar of its own instead of the app menu. See [menus](./menus). To show no bar at all, use `setChrome({ menu: false })`.
