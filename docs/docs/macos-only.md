---
title: "macOS only"
---

# macOS only

<p class="tagline"><code>tiny.macos.*</code> — AppleScript, Quick Look, OCR, screen recording, on-device AI, other apps' windows</p>

Some macOS features have no counterpart on Windows or Linux at all — AppleScript, Quick Look, Apple's on-device model. They live in `tiny.macos.*` so that it's plain from the call itself that it's macOS-only. Anything that could exist on another OS but isn't built there yet stays on `tiny.app` and reports itself through [`capabilities()`](./portability) instead — Spotlight search and the colour picker are on [system services](./services), Touch ID on [secrets](./secrets).

Off macOS, every `tiny.macos` call rejects — except `ai.availability()`, which answers `'unsupported'`, since it's the check you make first. The reason names the fix:

```text
tiny.macos.quickLook is macOS-only (this is windows) — guard with tiny.system.isMacOS()
```

So guard the call, or the UI that leads to it:

```js
if (tiny.system.isMacOS()) previewButton.hidden = false;
```

The backend has the same calls as `app.macos.*`; off macOS they throw the same error, naming `app.macos`. `capabilities()` reports `applescript`, `quickLook`, `ocr`, `recorder`, `ai`, `selectedText`, `otherWindows` and `moveOtherWindows` as `false` on Windows and Linux.

## AppleScript {#applescript}

```js
await tiny.macos.applescript('tell application "Music" to playpause');
const title = await tiny.macos.applescript(
  'tell application "Safari" to get name of front document');   // string | null
```

Runs AppleScript inside the app, without spawning `osascript`. It resolves the script's result as a string, or `null` when the result isn't text, and rejects with AppleScript's error message.

Scripting another app needs the user's permission to control it — macOS asks the first time. Check or ask ahead with the `'automation'` or `'automation:<bundle-id>'` [permission](./permissions). Scripts run on the main thread, so a slow one holds up the window until it finishes.

## Quick Look {#quick-look}

```js
tiny.macos.quickLook('/Users/me/photo.heic');
tiny.macos.quickLook([a, b, c]);   // the arrow keys move between them
tiny.macos.quickLook();            // close the panel
```

The preview panel Finder shows on the space bar, for one path or a list. Called with nothing (or `null`), it closes the panel if it's open.

## text recognition {#ocr}

```js
const { text, blocks } = await tiny.macos.ocr('/Users/me/scan.png');
// blocks: [{ text, confidence, box: { x, y, width, height } }]
```

Reads the text in an image with Apple's Vision framework, on the device, in its accurate mode with language correction. `text` is every line joined with newlines. Each block's `confidence` runs 0 to 1, and its `box` is in fractions of the image (0 to 1), measured from the top-left. It rejects if the image can't be read.

Together with [`tiny.app.captureScreen()`](./services#capture-screen) it turns a screenshot into text.

## screen recording {#recorder}

```js
await tiny.macos.recorder.start({ path: '/Users/me/Movies/demo.mp4' });   // screenId optional
// …
const { path, duration } = await tiny.macos.recorder.stop();   // duration in seconds
```

Records a screen to an H.264 `.mp4`. `start()` resolves once recording has begun; `stop()` resolves when the file is finished. `screenId` comes from `tiny.app.screens()`, and without one the first screen is recorded.

It needs macOS 14 and the `'screen'` [permission](./permissions), and rejects otherwise. It records video only, no sound, and one recording at a time: a second `start()` rejects with `'already recording'`, and `stop()` without a recording rejects with `'not recording'`. `start()` without a `path` rejects too.

## on-device AI {#ai}

```js
if (await tiny.macos.ai.availability() === 'available') {
  const summary = await tiny.macos.ai.generate('Summarise: ' + text, {
    instructions: 'Answer in one sentence.',
  });
}
```

Apple's on-device language model (Foundation Models): it runs offline, with no API key, and nothing leaves the computer. Always check `availability()` first:

| answer | meaning |
|---|---|
| `'available'` | ready |
| `'unavailable'` | Apple Intelligence is off, or the model hasn't finished downloading |
| `'unsupported'` | older than macOS 26, a tinyjs build without the model support compiled in, or not macOS |

`generate(prompt, { instructions })` resolves the reply as a string; `instructions` is the system prompt. It rejects with the reason, including `'not built in'` from a build without model support. `capabilities().ai` is `true` only when the build has it.

### tool calling {#ai-tools}

From the backend, `generate()` also takes `tools`: functions the model may call while it answers. A tool's `run` is your own function, which can't cross from a page to the backend, so this is backend-only — a page that passes `tools` gets a console warning and a plain reply.

```js
const { text, calls } = await app.macos.ai.generate('Move the window to 200, 120', {
  instructions: 'You control a desktop app window. Use the tools.',
  tools: [{
    name: 'moveWindow',
    description: 'Move the window on screen.',
    parameters: {
      x: { type: 'integer', description: 'x in points' },
      y: 'integer',
    },
    run: ({ x, y }) => { app.win.setPosition(x, y); return 'moved'; },
  }],
});
// calls: [{ name: 'moveWindow', args: { x: 200, y: 120 }, result: 'moved' }]
```

With `tools`, it resolves `{ text, calls }` instead of a string. A parameter's type is `'string'`, `'integer'`, `'number'` or `'boolean'`, written alone or with a `description`. Whatever `run` returns goes back to the model (objects as JSON). If `run` throws, the model gets `{ error: message }` and carries on.

**Read `calls`, not `text`.** `calls` is what the model actually did. Measured on macOS 26.5: asked for three tool calls in one turn, the model made all three in one run out of four — and its reply claimed all three every time, including the runs where it skipped one. It also passed a wrong argument once. Put anything that can't be undone behind a confirmation.

## other apps {#other-apps}

```js
const sel = await tiny.macos.selectedText();     // string | null
const wins = await tiny.macos.otherWindows();    // [...] | null
await tiny.macos.moveWindow(wins[0].pid, { x: 0, y: 0, width: 1280, height: 800 });
```

For PopClip-style popovers and window managers like Rectangle. All three need the `'accessibility'` [permission](./permissions).

- `selectedText()` is the text selected in the frontmost app, or `null` when nothing is selected or the app doesn't expose it.
- `otherWindows()` lists other apps' windows on screen: `{ app, bundleId, pid, title, index, x, y, width, height }`, in the same top-left coordinates as [`tiny.win.setPosition`](./window). It's `null` without the permission.
- `moveWindow(pid, rect)` moves and resizes that app's main window. It resolves `true`, or rejects with `'needs Accessibility'` or `'no movable window'`. The pid can also come from [`frontmostApp()`](./shell#frontmost).

## share sheet {#share}

The macOS share menu (AirDrop, Messages, Mail…) is `tiny.win.share()`, on `tiny.win` because it belongs to a window — see [window](./window#share).
