---
title: "how it works"
---

# how it works

<p class="tagline">two processes, one socket</p>

A tinyjs app is two processes. The **backend** is your JavaScript running on [txiki.js](https://txikijs.org/), with files, processes and the network. The **launcher** is a small native program (about 2 MB) that owns the window and the system webview your page runs in. They talk over a private socket — no HTTP server, no ports, nothing listening for anything else to find.

```text
┌───────────────────────────┐   private socket   ┌───────────────────────────┐
│ backend (txiki.js)        │◄──────────────────►│ launcher (native)         │
│ src/backend/main.js       │   one line per     │ · window, menus, tray     │
│ + tinyjs's bridge         │   message          │ · native dialogs          │
│ · your app logic, api     │                    │ · the system webview      │
│ · files, processes, net   │                    └─────────────┬─────────────┘
└───────────────────────────┘                                  │
                                                               ▼
                                                 ┌───────────────────────────┐
                                                 │ your page (file://)       │
                                                 │ tiny.api.call(…)          │
                                                 │ tiny.api.on(…)            │
                                                 └───────────────────────────┘
```

Each OS has its own launcher, and everything above the launcher is the same code on all three:

| | launcher | webview | socket |
|---|---|---|---|
| macOS | `launcher-macos.cc` | WebKit (WKWebView) | Unix socket |
| Windows | `launcher-win.cc` | WebView2 (Edge) | named pipe |
| Linux | `launcher-linux.cc` | WebKitGTK 4.1 | Unix socket |

## starting up {#startup}

**In `tinyjs dev`, and in Windows and Linux builds**, the backend starts first. It makes the socket in a fresh temp folder only your user can open (mode `0700`), then starts the launcher, pointed at your page. Your `init(app)` runs once the launcher has connected.

**A packaged macOS app** starts the other way round, because macOS wants the app's own executable to be the process with the window: the `.app` opens the launcher, which makes the socket and starts the backend (`tjs run …/entry.js`), and the backend connects to it. Your code can't tell the difference.

## the page {#page}

Your page loads as a real `file://` document from the frontend folder on every OS, so relative scripts, styles and images load straight from disk with no bundling step. The page gets `tiny` before its own scripts run. It has no `tjs` and no access to the file system: anything it needs from the system goes through the backend, as an [`api` call](./api).

## messages {#protocol}

The protocol is plain text, one line per message, with JSON payloads:

- **a call from the page** — `tiny.api.call()`, or any `tiny.*` method — travels to the backend as `CALL` and comes back as `RET`, which settles the page's promise;
- **events to the page** — `app.push()` and tinyjs's own events — are delivered by running `window.__emit(…)` in each window;
- **native operations** — set the title, show a dialog, register a hotkey — are one verb each, sent from the backend to the launcher, and can target one window (`VERB@<window id>`).

`TINYJS_DEBUG=1 tinyjs dev` prints every line in both directions, which is the fastest way to see what a call actually did.

## shutting down {#shutdown}

Closing the main window quits the app (unless it [hides on close](./window#visibility)): the launcher exits, and the backend notices and exits too. `tiny.quit()` and `app.quit()` go the other way, from the backend.

## what this means for your app {#consequences}

- Everything between the page and the backend crosses as JSON: send plain data, not class instances or functions.
- The backend isn't a webview, so it isn't slowed down when windows are hidden — continuous work belongs there. See [backend](./backend).
- Nothing listens on the network, so there's no port for another program to find or collide with.
- A site loaded in the app gets `tiny` too, which is why [site wrappers](./site-wrappers#api-gate) need the `api` gate.
