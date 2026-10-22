---
title: "shell & app surface"
---

# shell & app surface

<p class="tagline"><code>tiny.app.*</code> — open and trash files, launch at login, the Dock and taskbar</p>

The calls an app would otherwise shell out for (`open`, `explorer`, `xdg-open`), and the parts of the desktop the OS owns that your app decorates: the Dock on macOS, the taskbar on Windows, the dock or launcher on Linux. Every call here has the same name in the [backend](./backend#app): the page's `tiny.app.shell.open()` is `app.shell.open()`, `tiny.app.badge()` is `app.badge()`, and so on — the [API map](./api-map) lists both sides.

Facts about the machine — theme, sleep and wake, idle time, battery, language, keeping the computer awake — are on [system](./system). Before calling anything that isn't on every OS, ask [`tiny.system.capabilities()`](./portability): a key that's `false` there won't work on this machine.

## opening, revealing, trashing {#shell}

```js
await tiny.app.shell.open('https://tinyjs.app');   // the default browser
await tiny.app.shell.open('/Users/me/report.pdf'); // the default app for the file
await tiny.app.shell.reveal(path);                 // select it in Finder / Explorer / the file manager
await tiny.app.shell.trash(path);                  // move it to the Trash / Recycle Bin
```

- `open(target)` takes a URL with any scheme (`https:`, `mailto:`, `myapp:`…) or a file path. Called from a page the app didn't ship — a [wrapped site](./site-wrappers#api-gate) — it opens only `http(s)` and `mailto` links, and rejects anything else.
- `reveal(path)` opens the file's folder with the file selected. On Linux it asks the file manager over D-Bus, and opens the parent folder when the file manager doesn't answer.
- `trash(path)` is recoverable. Use it instead of deleting the user's files.

Each resolves `true`, or rejects with the reason as a string — `'no such file'`, `'no application registered for URL'`, or the OS's own message. On macOS, `~` in a path is expanded and `file://` URLs work as paths; on Linux, only a path starting with `/` counts as a file, so pass absolute paths.

## becoming the default app {#default-handler}

```js
const r = await tiny.app.setAsDefaultHandler('md');   // or 'folder'
// 'ok' | 'unsupported' | 'failed'
```

Makes this app the default opener for an extension, or for folders. Call it only when the user asks for it: an app that quietly takes over a file type gets uninstalled.

It works on Linux only, in a built app, for an extension listed in [`fileExtensions`](./config#fileExtensions) (or `'folder'`, with [`openFolders`](./config#openFolders)): the app registers those file types on its first run, and this points them at it with `xdg-mime`. macOS and Windows answer `'unsupported'` — Windows deliberately doesn't let apps set this themselves, so send the user to Settings there.

## launch at login {#launch-at-login}

```js
const status = await tiny.app.launchAtLogin.get();
// 'enabled' | 'disabled' | 'requires-approval' | 'unsupported'
await tiny.app.launchAtLogin.set(true);   // resolves the new status
```

| | how | `'unsupported'` when |
|---|---|---|
| macOS | a login item (SMAppService) | not a built `.app`, or macOS older than 13 |
| Windows | an `HKCU\…\Run` registry value | not a built app |
| Linux | an autostart `.desktop` file in `~/.config/autostart` | not a built app |

Under `tinyjs dev` it always answers `'unsupported'`: there's no built app yet to start at login. `'requires-approval'` is macOS: the item is registered, but the user has to allow it in System Settings → General → Login Items. If registering fails outright, `set()` rejects with the reason.

## the Dock, taskbar and launcher {#app-surface}

```js
tiny.app.badge('3');           // a count on the icon; '' clears it
tiny.app.progress(0.4);        // a progress bar on the icon, 0..1
tiny.app.progress(null);       // remove it
tiny.app.attention();          // get the user's attention
tiny.app.attention({ critical: true });
tiny.app.icon('/abs/path/tile.png');   // replace the icon; '' restores the original
tiny.app.presence('menubar');  // no Dock icon or taskbar button; 'normal' brings it back
```

These are fire-and-forget: they resolve once the request is sent, and where the OS has no way to show something, nothing happens and nothing rejects. `presence()` rejects a mode other than `'normal'` or `'menubar'`. `icon()` takes an absolute path to a png; a file that can't be read leaves the icon as it was. Render a canvas to a png to make a live icon — it combines with `badge()` and `progress()`.

| | macOS | Windows | Linux |
|---|---|---|---|
| `badge` | Dock badge, any text | an overlay on the taskbar button: one or two characters; longer text shows as a dot | a count: numbers only, other text hides the badge |
| `progress` | bar on the Dock icon | bar on the taskbar button | bar on the dock icon |
| `attention()` | a short Dock bounce | flashes the taskbar button until the window comes to the front | the window's urgency hint |
| `attention({ critical })` | bounces until the app is activated | flashes for longer | same as without |
| `icon` | the Dock icon | the window icon (title bar, Alt-Tab) — not the taskbar button | the window icon |
| `presence('menubar')` | no Dock icon, not in ⌘-Tab | no taskbar button | hidden from the taskbar |

On Linux, `badge` and `progress` need a dock that implements the Unity launcher protocol — KDE Plasma, Ubuntu Dock and Dash to Dock do, plain GNOME Shell doesn't — and `icon`, `attention` and `presence` work under X11 only: GNOME on Wayland has nowhere to put them. `capabilities()` answers each of these (`badge`, `progress`, `icon`, `attention`, `presence`) for the current desktop.

`presence('menubar')` suits an app that lives in the [tray](./tray); give it a tray icon or a [hotkey](./hotkeys) so the user can still reach it.

## the frontmost app {#frontmost}

```js
const front = await tiny.app.frontmostApp();
// { name, bundleId, pid } | null
```

The app the user is in right now — the one focus goes back to after `tiny.win.hide()`, which is how a palette or clipboard app pastes into it (see [keystrokes](./keystrokes)). On Windows `name` is the program's file name without `.exe` and `bundleId` is `null`. On Linux it's always `null`.

## sounds {#sounds}

```js
await tiny.app.beep();                    // the system alert sound
await tiny.app.playSound('success');      // 'info' | 'success' | 'alert' | 'error'
await tiny.app.playSound('/abs/path/ding.wav');
```

Both resolve `true`, or `false` if the sound couldn't be played; they never reject. The four names are portable: each maps to that OS's closest sound (Ping, Glass, Funk and Basso on macOS; the system sound aliases on Windows; the freedesktop sound theme on Linux).

`playSound()` also takes an OS's own sound name — `'Glass'` on macOS, `'SystemHand'` on Windows, `'complete'` on Linux — but those don't carry across: `'Glass'` on Windows resolves `false`. For your own sound, pass an absolute path to an audio file. On Linux a file plays through `paplay`, `pw-play` or `aplay`, whichever is installed.

## about the app {#info}

```js
await tiny.app.info();   // { version: '1.2.0', tinyjs: '0.62.1', runtime: 'txiki.js …' }
```

`version` is your [`version`](./config#version) from tinyjs.json, and `tinyjs` the tinyjs version that built the app (`'dev'` when it's run from a tinyjs checkout).

Updating the app is `tiny.app.update` — see [auto-update](./auto-update).

### standard folders {#paths}

```js
const p = await tiny.app.paths();
// { home, data, cache, logs, temp, downloads, desktop, documents,
//   resources, executables }
```

Use these instead of hardcoding `~/Library/…` or `%APPDATA%`:

| | |
|---|---|
| `data`, `cache`, `logs` | this app's own folders, named after its [`id`](./config#id). They exist by the time `paths()` resolves. Keep a [sqlite](./sqlite) or settings files in `data`. |
| `home`, `downloads`, `desktop`, `documents` | the user's folders |
| `temp` | the system temp folder |
| `resources` | your [resources](./resources) folder, or `null` without one |
| `executables` | the folder of your [executables](./executables), or `null` if none shipped |

## language and region {#locale}

The user's languages, region and time zone come from `tiny.system.locale()`, and changes arrive in the backend's `onLocale` hook — see [system](./system#locale).
