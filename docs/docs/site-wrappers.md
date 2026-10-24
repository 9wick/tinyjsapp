---
title: "site wrappers"
---

# site wrappers

<p class="tagline">a hosted web app as a desktop app</p>

A site wrapper is an app whose main window shows a hosted site, such as `https://app.example.com`, instead of a frontend you ship. You get the site's own UI, a Dock or taskbar icon, menus, notifications and a backend, and you don't have to maintain a copy of the site.

A hosted page needs things a local page never did: native `alert`/`confirm`/`prompt`, downloads that land on disk, a say in where links and popups go, and find-in-page. tinyjs handles all of these on all three platforms. The one thing you must add yourself is a [gate](#api-gate) on what the site's JavaScript may call.

## quick start {#quick-start}

```sh
tinyjs wrap https://app.example.com
cd app-example-com && tinyjs dev
```

[`tinyjs wrap`](./cli#wrap) fetches the site's title and icon and writes a project: `url`, an `api` gate, `"popups": "window"`, `"downloads": "ask"`, and a small backend that logs navigations and downloads to the terminal. Read the [gate it writes](#what-wrap-writes) before you ship it.

By hand, the minimum is:

```json
{
  "name": "example",
  "url": "https://app.example.com",
  "api": "none"
}
```

## loading the site {#url}

[`url`](./config#url) makes the main window load that page. No `src/frontend/` is needed, and it can't be combined with `"mainWindow": false`. `app.reload()` reloads the live page.

Use `url`, not `frontend.devUrl`. `devUrl` exists only for [`tinyjs dev`](./cli#dev) and its dev server. A build ignores it and ships your built frontend instead.

Two more keys adjust the site:

- [`userAgent`](./config#userAgent) replaces the webview's user agent, for sites that sniff it. On Windows it's applied to the main window only. Popups and other windows keep WebView2's own.
- [`inject`](./config#inject) is a script that runs at document start in the top frame of every page, after `tiny` is set up and before the site's own scripts. Use it to add a find bar, hide a banner or patch a missing API. It runs as part of the site's page and has no extra rights: its `tiny` calls are gated as the site's origin, and the site's code can read or undo anything it does.

Cookies, `localStorage` and IndexedDB live in the webview's own store, shared by every window of the app. On Windows each app gets its own WebView2 profile in `%APPDATA%\<id>\WebView2`, and the dev and built copies share it. See [cookies](#cookies) for reading and setting the jar from the backend.

## the api gate {#api-gate}

`tiny` is put into every page the app loads, including a wrapped site. Without a gate, the site's JavaScript (and every script it loads: analytics, ads, a dependency someone compromised) can call anything your app can, from `tiny.store.all()` to your own `api` functions. The [`api`](./config#api) key in tinyjs.json limits that.

The gate runs in the backend, on every call, before anything else happens. A page can rewrite its own `tiny` object, so checks in the page don't protect anything. The gate goes by the calling frame's origin as the webview engine reports it, never by anything the page sends. The launcher adds that origin to every call itself.

### how a call is decided {#gate-rules}

| `api` | a call is allowed when |
|---|---|
| omitted, `"all"` | always. Fine for an app that only shows its own pages |
| `"none"` | never (only `tiny`'s own start-up call gets through) |
| `"wrapper"` | it's in the [wrapper preset](#wrapper-preset) |
| `["notify", "store.*"]` | it's in the list |
| `{ "disable": […], "enable": […] }` | it's in `enable`, or it isn't in `disable`. `enable` wins |
| `{ "preset": "wrapper", "enable": […] }` | it's in the preset or in `enable` |
| `{ …, "origins": { … } }` | the first key that matches the caller's origin decides. An origin that matches no key falls back to the top-level `enable`/`disable` lists, or gets nothing when there are none |

Each value in `origins` takes any of the forms above: `"all"`, `"none"`, `"wrapper"`, a list, or an object.

```json
{
  "api": {
    "disable": ["*"],
    "enable": ["win.close", "win.minimize"],
    "origins": {
      "https://app.example.com": ["notify", "app.badge", "store.get", "store.set"],
      "file://*": "all"
    }
  }
}
```

Here the wrapped site can notify, badge and use two store calls. Your own `file://` pages can call anything. Any other origin the window lands on (a sign-in page, a redirect, a link) can only close or minimize the window.

**Method names** are what the call is named on the wire, as the [API map](./api-map) lists them: `notify`, `win.setTitle`, `store.get`, and your own `api` functions by their plain name. `store.*` covers every call starting with `store.`. `*` on its own covers everything.

**Origin keys** are `scheme://host[:port]`, with no path and no trailing slash. A default port is left out, and your own pages are `file://`. `*` matches any run of characters, dots and colons included, and the key has to match the whole origin:

| key | matches | doesn't match |
|---|---|---|
| `https://app.example.com` | exactly that | `https://app.example.com:8443`, `http://app.example.com` |
| `https://*.example.com` | every subdomain, at any depth | `https://example.com` (add it as its own key) |
| `https://app.example.com*` | **also `https://app.example.com.evil.net`** | — |

Write the host out in full, and give each port its own key.

### mistakes to avoid {#gate-mistakes}

- **You can't take calls out of a preset.** `enable` wins over `disable`, so `{ "preset": "wrapper", "disable": ["shell.open"] }` still allows `shell.open`. To drop something from the preset, list what you want instead.
- **A string preset applies to every origin.** `"api": "wrapper"` with no `origins` gives the preset to wherever the window ends up, including any site the wrapped one links or redirects to. Use `origins` to name the site.

Values that can't mean what they seem fail closed, and log a message saying so: a misspelt preset name, `false` or `""` (treated as `"none"`), or anything that isn't a string, list or object. An `enable` list on its own means "only these" — `{ "enable": ["notify"] }` is the same as `["notify"]`, at the top level and inside `origins`.

### the wrapper preset {#wrapper-preset}

`"wrapper"` is the only preset. It allows exactly these calls:

| | |
|---|---|
| window and app chrome | `win.*`, `menu.*`, `tray.*`, `app.badge`, `app.attention`, `app.progress` |
| dialogs and notifications | `dialog.*`, `notify` |
| storage | `store.*` |
| system | `shell.open`, `clip.write`, `sound.play`, `nowplaying.*`, `power.prevent`, `power.allow` |
| read-only | `theme.get`, `system.locale`, `system.capabilities`, `system.requirements`, `system.info`, `app.info` |

Everything else is denied, for example `tiny.fetch`, reading the clipboard, secrets, screen capture, global hotkeys, permission requests, `shell.reveal` and `shell.trash`, and **your own `api` functions**. Add those by name with `{ "preset": "wrapper", "enable": ["saveDraft"] }`.

`shell.open` is in the preset, but a page the app didn't ship — the wrapped site, or anywhere it navigates — can only open `http(s)` and `mailto` links with it; a local path, a `file://` URL or any other scheme is refused. Your own pages (`file://`, the dev server) can open anything.

The preset is still broad. `win.*` includes dragging and sharing local files out of the app, and `store.*` includes reading and overwriting the whole store. For a site you don't control, prefer a [short explicit list](#securing).

### camera, microphone and the media proxy {#media}

Camera and microphone access in the page never goes through the bridge, so the gate treats them as three extra names that only count inside `origins`: `media.camera`, `media.microphone` and `media.proxy`.

- On **macOS**, an origin whose key allows `media.camera` or `media.microphone` gets the device without WebKit's per-site prompt. Other origins see the prompt.
- On **Linux**, where there's no prompt, only those origins (and your own pages) get the device at all, and only if [`permissions`](./config#permissions) declares it.
- On **Windows**, these names are ignored. WebView2 always shows its own prompt.
- `media.proxy` lets the origin use `tiny.proxyURL()`.

Presets and top-level lists never grant these. An origin whose value is `"all"` does. See [permissions](./permissions#media) for the rest.

### events {#events}

Events the backend sends to pages — `app.push()` and tinyjs's own — go through the gate too. The app's own pages (`file://`, the dev server) get every event; a page from any other origin gets one only if its rules allow the event's name:

| event | allowed by |
|---|---|
| `menu`, `contextmenu` | `menu.*` |
| `tray`, `trayclick` | `tray.*` |
| `window-state`, `window-closed`, `screens-changed` | `win.*` |
| `theme` | `theme.get` |
| `locale` | `system.locale` |
| `media-key` | `nowplaying.*` |
| `notification-click`, `notification-action` | `notify` |
| `clipboard-change` | `clip.read` |
| `hotkey` | `hotkey.*` |
| everything else — `open-url`, `open-files`, `drop`, `download`, `navigate`, `popup`, `audio-tap`, `update-available`, and every event your app pushes | `event.<name>`, granted by name |

So the `"wrapper"` preset hears menu, tray, window, theme, locale, Now Playing and notification events, but not the ones that carry local data — a deep link's OAuth code, dropped or downloaded file paths, audio. To push one of your own events to a site, grant it: `"enable": ["event.refresh"]`. Each event is checked against the page in the window when it's delivered, so a window that has navigated elsewhere since doesn't receive it. Without an `"api"` block every page gets every event, as before.

### iframes {#iframes}

`tiny` is meant for the top frame, but a script in an iframe can still try to call the bridge by hand. On macOS such a call is allowed only when an `origins` key matches the iframe's own origin, and then under that key's rules. Top-level lists, presets and a missing `api` count for nothing there. On Linux and Windows, calls from iframes never reach the backend.

### checking from the page {#capabilities}

Every `tiny` function exists on a wrapped site whether or not the gate lets it through, so `typeof` tells the site nothing. [`tiny.capabilities`](./portability#capabilities) answers for the site's own origin, and works under any gate, even `"none"`, since it can't tell a page more than calling would:

```js
await tiny.capabilities.ready;
if (tiny.capabilities.can('notify')) showNotifyToggle();
tiny.capabilities.get('clipboard.read');
// { ok: false, why: 'gate', needs: ['clip.read'] } — what to add to "enable"
```

A denied call rejects with `"<name>" is disabled by tinyjs.json "api"`. Run `TINYJS_DEBUG=1 tinyjs dev` to log each denial with the origin it came from, which is the quickest way to find what a site needs.

### your own api functions {#own-api}

Every `api` function gets the caller's origin as its third argument. Once you've enabled a function for a wrapped site, check the origin inside it too, and treat its params as input from that site:

```js
export const api = {
  saveDraft: async ({ text }, app, { origin }) => {
    if (origin !== 'https://app.example.com') throw new Error('not allowed');
    if (typeof text !== 'string' || text.length > 100_000) throw new Error('bad draft');
    await app.store.set('draft', text);
    return true;
  },
};
```

## securing a wrapper {#securing}

The site's JavaScript runs with whatever its origin is allowed. So does any script it loads, and so does anyone who finds an XSS bug in it. You decide how much that is. Some other paths into your app have no gate at all.

- **Events aren't gated.** `app.push()` and every built-in event (a deep link, the paths of opened or downloaded files, navigations in other windows, notification clicks) reach every window's page, the wrapped site included. Don't push anything you wouldn't hand the site.
- **`inject` has no extra rights.** It runs in the site's page, with the site's origin.
- **The window can leave the site.** Links and redirects take the main frame to other origins. Each is gated as itself: under `origins`, an unlisted one gets only the top-level lists.
- **Opening things is a capability.** An `'external'` answer from [`onNavigate`](#navigation) hands a site-chosen URL to the OS. `shell.open` from a site is limited to `http(s)` and `mailto` links.

A good starting config for a site you don't control:

```json
{
  "url": "https://app.example.com",
  "popups": "window",
  "downloads": "ask",
  "api": {
    "disable": ["*"],
    "enable": ["win.close", "win.minimize", "win.zoom", "win.startDrag"],
    "origins": {
      "https://app.example.com": [
        "notify", "app.badge", "win.find", "win.stopFind", "win.setTitle",
        "system.capabilities"
      ]
    }
  }
}
```

- The site gets notifications, a badge, find-in-page and its own title. No store, no `shell.open`, none of your functions.
- Every other origin gets window controls only, so a frameless window can still be closed and dragged.
- Add calls one at a time, by name, as you find you need them. Prefer a function of your own that does one specific thing over enabling a whole namespace.
- Keep tokens in [secrets](./secrets), which the gate never opens to a page, rather than in the store.
- If the site loads in an iframe of your own page instead, give your page's `file://` its own key.

### what `tinyjs wrap` writes {#what-wrap-writes}

`tinyjs wrap` gives the site's origin (or, with `--origins`, its subdomains or a list) the whole `"wrapper"` preset, and every other origin `win.close`, `win.minimize`, `win.zoom` and `win.startDrag`. That's convenient for trying a site out. For a site you don't run, swap the preset for an explicit list as above.

## navigation {#navigation}

Export `onNavigate` from the backend to follow every page load, and to stop the ones you don't want.

```js
// src/backend/main.js
const HOME = 'https://app.example.com';

export function onNavigate(info, app) {
  if (info.kind === 'policy') {
    const url = new URL(info.url);
    if (url.protocol === 'mailto:') return 'external';           // open the mail app
    if (/^https?:$/.test(url.protocol) && url.origin !== HOME) return 'external';
    return;                                                        // allow
  }
  if (info.kind === 'fail') app.push('offline', { url: info.url, error: info.error });
}
```

`info` is `{ window, kind, url, isMainFrame?, error? }`:

| `kind` | when | your return value |
|---|---|---|
| `policy` | before a main-frame `http(s)` navigation, in any window | `'deny'` blocks it, `'external'` opens it in the default browser, anything else allows |
| `policy` | before a navigation to any other scheme (`mailto:`, `tel:`, `zoommtg:`…), in any frame | `'external'` hands it to the OS; anything else blocks it |
| `start`, `commit`, `finish` | the load's progress | ignored |
| `fail` | the load failed; `error` says why | ignored |
| `crash` | the page's web process died | ignored |

- **Answer fast.** An `http(s)` ask with no answer after about 400 ms is allowed, so a slow or missing handler can't stop the site from loading. An ask for another scheme with no answer is blocked.
- `file://` pages and iframe navigations to `http(s)` aren't asked.
- `isMainFrame` is `true` for `http(s)` asks. For other schemes it's `true` or `false` on macOS and `null` on Linux and Windows, which can't tell.
- The page gets the same events (except `policy`) as `tiny.api.on('navigate', fn)`.

Only return `'external'` for schemes you know. A site can name any URL, and on Windows some registered schemes start programs.

What a block can and can't do depends on the engine:

| | |
|---|---|
| macOS | the navigation is held until you answer. A block means no request is made |
| Windows | the navigation is cancelled and, if allowed, started again. A form POST that's asked comes back as a GET. Back and forward aren't asked. A page's `beforeunload` prompt can show twice. Other schemes are only asked about when some app on the PC is registered for them |
| Linux | the ask comes once the server has answered. A block stops the page showing, but the request was already made |

Treat a block as "don't show this page", not as a way to stop requests reaching a server.

## popups {#popups}

[`popups`](./config#popups) decides what `window.open` and `target="_blank"` do:

| | |
|---|---|
| `"external"` (default) | `http(s)` URLs open in the default browser |
| `"window"` | a new app window. `window.opener`, `postMessage` and `window.open`'s return value work, which sign-in popups need |
| `"deny"` | nothing opens |

Export `onWindowOpen` to decide each popup yourself:

```js
export function onWindowOpen(info, app) {
  if (info.kind !== 'policy') return;             // 'open' reports the outcome
  const host = new URL(info.url).hostname;
  if (host === 'accounts.example.com') return 'window';
  return 'external';
}
```

The `policy` call comes before anything appears: `{ kind: 'policy', window, opener, url, mode }`, where `mode` is the configured `popups` value and `opener` is the id of the window that asked. Return `'window'`, `'external'` or `'deny'`. Anything else, or no answer within about 400 ms, keeps the configured mode.

- In `"window"` mode the popup already exists, hidden and loading, under `info.window` while you decide.
- In the other modes there's no window to show, so only `'external'` and `'deny'` work. To be able to answer `'window'`, set `"popups": "window"` and send the rest elsewhere from the hook.
- A `kind: 'open'` call follows with `action` (`'window'`, `'external'` or `'deny'`). The page gets the same as `tiny.api.on('popup', fn)`.
- Popup windows are named `popup1`, `popup2`… Close one from the backend with `app.window(id).close()`. They take the page's title and have standard window chrome; on macOS and Linux they also use the size and position passed to `window.open`.
- Popup and navigation policy both apply. A popup you allow whose URL `onNavigate` then blocks shows as an empty window.

A popup's page gets its own `tiny`, gated on its own origin, not its opener's. On **Windows**, calls from a popup's page currently never return, and the page's own `window.close()` does nothing. Close Windows popups from the backend.

### sign-in {#sign-in}

Most sign-in flows work in one of two ways, and both work in a wrapper:

- **A popup** that posts back to its opener needs `"popups": "window"`.
- **A redirect** of the main window through the identity provider and back needs nothing special. While the window is on the provider's origin, the gate treats it as any other unlisted origin.

The cookies the site sets go in the app's own jar (see [cookies](#cookies)). Some providers refuse to sign in inside an embedded webview at all. [`userAgent`](./config#userAgent) can help with a site that only sniffs the user agent.

## downloads {#downloads}

`<a download>`, blob URLs and any response the webview can't display become downloads. [`downloads`](./config#downloads) sets what happens:

| | |
|---|---|
| `"auto"` (default) | saved to the user's Downloads folder; a name that's taken gets ` (2)`, ` (3)`… |
| `"ask"` | a save dialog, pre-filled with the file's name |
| `"deny"` | refused |

The backend's `onDownload(info, app)` and the page's `tiny.api.on('download', fn)` report each one. They can't change where it goes:

```js
export function onDownload(info, app) {
  // { id, url, filename, path, state, bytes?, total?, error? }
  if (info.state === 'done') app.notify('Downloaded', info.filename, { id: 'dl-' + info.id });
}
```

`state` is `started`, `progress` (with `bytes` and `total`, about four times a second; `total` is `-1` when the size isn't known), `done`, `failed`, `denied` or `cancelled`. `path` is where the file landed, `null` until known. `filename` matches the file on disk.

The Downloads folder is the system's: the user's Downloads on macOS, the Downloads known folder on Windows (even when it's redirected), and the XDG download directory on Linux. On a Windows PC whose WebView2 runtime is too old for this, downloads use WebView2's own UI.

## JS dialogs {#js-dialogs}

`alert()`, `confirm()` and `prompt()` in the site show native dialogs titled with the page's origin (its host, on Linux), and return what the user chose. On Windows a page's `beforeunload` warning shows as a confirm box too. These need no `api` entry. They're the page's own dialogs, not calls to tinyjs.

## find in page {#find}

[`tiny.win.find()`](./window#find) searches the page and steps through the matches. It's the search behind a ⌘F bar, and you draw the bar. In a wrapper, that means drawing it with `inject`:

```js
// inject.js — runs in the wrapped site's page
tiny.menu.on(async (id) => {
  if (id !== 'find') return;
  const term = prompt('Find');
  if (term) await tiny.win.find(term);
});
```

```js
// backend: put a Find item with a shortcut in the menu bar
export async function init(app) {
  app.menu.set([{ title: 'Edit', items: [{ id: 'find', label: 'Find…', key: 'f' }] }]);
}
```

The site's origin needs `win.find` (and `win.stopFind`) in its gate. On Windows, WebView2's own Ctrl+F is off unless you turn on [`browserAccelerators`](./config#browserAccelerators).

## cookies {#cookies}

A wrapped site's sign-in lives in the webview's cookie jar, which the backend can read and change — to keep a session, or sign out. See [cookies](./cookies).

