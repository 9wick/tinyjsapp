---
title: "permissions"
---

# permissions

<p class="tagline">tiny.app.permissions — check and ask before you need it</p>

Some features only work once the user has allowed them in the OS: posting keystrokes needs Accessibility, screenshots need Screen Recording, and so on. `tiny.app.permissions` lets you find out where you stand and ask at a moment you choose, so the app can say "needs Accessibility to paste — Open Settings" instead of failing silently the first time.

This page is about the runtime API. The [`permissions`](./config#permissions) key in tinyjs.json is a separate thing: it declares the camera, microphone and location reasons shown in macOS's prompts, and on Linux whether pages may use the camera and microphone at all. See [camera and microphone](#media) below.

The backend has the same calls on `app.permissions`.

```js
const status = await tiny.app.permissions.check('accessibility');
if (status !== 'granted') showOnboarding();
```

## check and request {#check}

```js
await tiny.app.permissions.check(name);    // -> status, never prompts
await tiny.app.permissions.request(name);  // -> status, may prompt
```

Both resolve to one of:

| status | |
|---|---|
| `'granted'` | allowed |
| `'denied'` | refused, or not granted yet where the OS can't tell the difference |
| `'undetermined'` | the user hasn't been asked yet |
| `'unsupported'` | this name means nothing here (wrong OS, or a dev build where it needs a packaged app) |

Neither rejects, so you can call them on any OS. An unknown name resolves `'unsupported'`.

A typical onboarding step:

```js
async function ensureAccessibility() {
  const p = tiny.app.permissions;
  if (await p.check('accessibility') === 'granted') return true;
  await p.request('accessibility');   // opens the system prompt / System Settings
  return false;                       // ask the user to come back after enabling it
}
```

## permission names {#names}

| name | what it covers (macOS) |
|---|---|
| `'accessibility'` | posting keystrokes ([`keystroke`, `paste`](./keystrokes)), reading other apps' windows and selected text |
| `'screen'` | screenshots and screen recording (`captureScreen`, `macos.recorder`) |
| `'notifications'` | notification banners — see [notifications](./notifications#permission) |
| `'microphone'`, `'camera'` | the system layer under `getUserMedia` |
| `'location'` | Location Services; [`system.wifi()`](./system#wifi) needs it for `ssid` and `bssid` on macOS 14+ |
| `'automation'` | sending Apple Events to System Events (`macos.applescript`) |
| `'automation:<bundle-id>'` | sending Apple Events to that app, e.g. `'automation:com.apple.Music'` |

## per OS {#os}

**macOS** asks the real system permission store (TCC), with these details:

- `'accessibility'` reads only `'granted'` or `'denied'`. `request()` shows the system prompt, which sends the user to System Settings with your app listed. Once it has been denied it can't prompt again, so System Settings is the only way back. After the user ticks the box, the status may not change until the app is relaunched — re-checking straight away can still say `'denied'`.
- `'screen'` never reads `'undetermined'`: macOS only offers a yes/no check for screen recording, so it's `'denied'` until granted in System Settings.
- `'notifications'` is `'unsupported'` unless the app is a packaged `.app`. `request()` shows the notification prompt.
- `'microphone'` and `'camera'`: `request()` prompts only while the status is `'undetermined'`. After a denial it resolves `'denied'` without asking; the user has to change it in System Settings.
- `'location'`: `request()` prompts only while the status is `'undetermined'`, and only in a packaged app that declares `location` in [`permissions`](./config#permissions) — without the declaration macOS ignores the request, so it resolves `'undetermined'` with no prompt (and does so in `tinyjs dev` too). An app shows up under Location Services in System Settings only after it has asked. `'denied'` also covers Location Services being switched off for the whole Mac.
- `'automation'` and `'automation:<bundle-id>'`: `request()` shows the consent dialog. If the check itself fails — a target that can't be found, for instance — the status is `'undetermined'`.

**Windows** has no equivalent permission store. The five plain names resolve `'granted'`; `'location'` and `'automation'` names resolve `'unsupported'`.

**Linux** has no equivalent either, and answers the same way: `'granted'` for the five plain names, `'unsupported'` for `'location'` and `'automation'` — except in a Wayland session, where `'accessibility'` and `'screen'` are `'unsupported'`, because keystrokes and screen capture don't work there. Otherwise `'granted'` only means there is no permission to get, not that the feature exists; check [`tiny.system.capabilities()`](./portability) for that.

## camera and microphone in pages {#media}

`getUserMedia()` works in the app's own pages. Who gets asked depends on the OS and on which page is asking.

**macOS**: in the app's own pages, the launcher answers WebKit's per-site prompt itself, so the user sees one system dialog naming your app. Any other origin — a wrapped site, a page it navigated to, a third-party iframe — gets WebKit's own prompt naming that origin, unless the [`api`](./config#api) gate's `origins` key allows `media.microphone` or `media.camera` for it:

```json
{
  "api": {
    "origins": { "https://meet.example.com": ["media.*", "notify"] }
  }
}
```

A packaged app must also declare why it wants each device in [`permissions`](./config#permissions):

```json
{ "permissions": { "microphone": "To record voice notes", "camera": "For video calls" } }
```

The strings become the text of the system dialog — macOS ends an app that tries to capture without one — and signed builds get the matching hardened-runtime entitlements.

**Linux**: there is no system dialog to fall back on, so the launcher decides. A page gets the camera or microphone only if `permissions` declares that device **and** the page is one of the app's own (or its origin is allowed `media.camera` / `media.microphone` in `api` `origins`). Everything else is denied without a prompt. The check uses the main frame's URL, so an iframe inside an allowed page shares its grant.

**Windows**: WebView2 shows its own permission prompt; the `permissions` key isn't needed.

## in development {#dev}

In `tinyjs dev`, macOS grants attach to the shared tinyjs launcher rather than to your app: every app you run in dev shares them, and updating the launcher asks again. A packaged app has its own identity and its own grants. Features that need a packaged app — notifications from Notification Center, [audio filters](./audio#macos), the [audio tap](./audiotap#dev) — behave differently in dev too.

## in a site wrapper {#api-gate}

The calls go over the wire as `perm.check` and `perm.request`, the names to use in the [`api`](./config#api) gate. The `"wrapper"` preset doesn't include them.
