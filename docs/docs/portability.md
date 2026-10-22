---
title: "portability"
---

# portability

<p class="tagline">macOS, Windows and Linux</p>

All three run the same runtime and the same protocol; only the launcher and the transport differ.

```text
              launcher source            webview               transport
macOS         launcher-macos.cc         WebKit                unix socket
Windows       launcher-win.cc           WebView2              named pipe
Linux         launcher-linux.cc         GTK3 + WebKitGTK 4.1  unix socket
```

**Anything unported fails cleanly, so cross-platform code can feature-detect.** Capability calls reject with a specific reason, query calls resolve `null`, and fire-and-forget ones are silent no-ops. Ask before you call:

```js
const caps = await tiny.system.capabilities();
// -> { os: 'macos' | 'windows' | 'linux', badge: true, progress: true, … }
// Anything ABSENT from the answer is supported on that platform.
if (caps.badge) tiny.app.badge('3');
// the backend asks the same questions: app.system.capabilities(), .os(), …

// synchronous, safe during page setup (the webview's own UA is decisive)
tiny.system.os();  tiny.system.isMacOS();  tiny.system.isWindows();  tiny.system.isLinux();

// the chip is the one thing the page CAN'T see: WKWebView reports MacIntel
// on Apple silicon, so ask the backend
await tiny.system.architecture();   // 'arm64' | 'x86_64'

// Linux assembles media codecs, speech etc. from packages, so a feature can
// be missing on one box — ask, and tell the user the fix. All ok elsewhere.
await tiny.system.requirements(['media.aac']);
// -> [{ id, ok, feature, detail, install: { manager, packages, command } }]
// ids: media.aac, media.h264, media.mp3, speech, spotlight.index, audioTap, globalHotkeys,
// mouseTracking, tray, windowPosition. { refresh: true } re-probes.
const gaps = await tiny.system.missing();  // just the ones that failed
// or: a native dialog naming what's missing, offering to copy ONE install
// command; shows nothing when all is present, so call it from a failure path
audio.addEventListener('error', () => tiny.system.promptMissing(['media.aac']));
```

Some things are not "not ported yet" but concepts the other OSes don't have — AppleScript, Quick Look. Those live in `tiny.macos.*` and reject elsewhere (except `ai.availability()`, which answers `'unsupported'`, since it's the check you make first), so the split is visible in the call itself. Everything that *could* exist on another OS stays on `tiny.app` and answers `'unsupported'` until it does.
