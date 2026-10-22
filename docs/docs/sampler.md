---
title: "sound effects"
---

# sound effects

<p class="tagline">tiny.audio.sampler — low-latency sound effects</p>

`tiny.audio.sampler` is one sound-effects mixer for the whole app. You load short sounds into it once, then fire them as often as you like, each with its own volume, pan and pitch. It's for game and interface sounds — clicks, chimes, footsteps. Music and long recordings belong in an `<audio>` element, and it isn't a sequencer: there's no scheduling a sound for an exact future time.

It exists so sound effects work on Linux, where Web Audio crackles under WebKitGTK. There the launcher decodes and mixes the sounds natively, on PipeWire's real-time thread. On macOS and Windows it mixes with Web Audio in the main window's page, which is already real-time there. The calls and the sound are the same everywhere; `tiny.system.capabilities().sampler` says `'native'` or `'page'` if you're curious, but you don't need to branch on it.

The mixer is app-wide: every window and the backend (`app.audio.sampler`) drive the same one, with the same sounds loaded.

```js
const s = tiny.audio.sampler;
await s.load('click', (await tiny.app.paths()).resources + '/click.wav');
s.play('click', { vol: 0.6 });
```

## loading sounds {#load}

`load(name, source)` decodes a sound into the mixer under `name` and resolves `true` once it's ready to play. Loading the same name again replaces it.

```js
const dir = (await tiny.app.paths()).resources;
await Promise.all([
  s.load('coin', dir + '/coin.wav'),
  s.load('jump', dir + '/jump.mp3'),
]);
```

`source` is either:

- **an absolute file path** — the best choice: the file is read from disk where it's decoded, and its bytes never travel between processes. Ship sounds in [resources](./resources).
- **an `ArrayBuffer`, typed array or `Blob`** — the bytes are written once to the app's cache folder and loaded from there. The backend accepts `ArrayBuffer` and typed arrays, not `Blob`.

WAV, MP3 and FLAC are guaranteed to decode on every OS. Other formats depend on the platform: on Linux the launcher decodes, and handles exactly those three; on macOS and Windows the webview decodes, and usually handles more.

`load()` rejects:

- for a path that isn't an audio file — it must have an audio extension (`.wav`, `.mp3`, `.flac`, `.ogg`, `.m4a` and similar) and start like one;
- when the sound can't be decoded;
- on macOS and Windows, after 15 seconds with no answer from the main window's page.

Decoded audio is what takes memory: about 375 KB per second of 48 kHz stereo. That's why this is for short sounds. `unload(name)` frees a sound when you're done with it.

## playing {#play}

`play(name, opts)` starts a voice and resolves to a handle for it:

```js
const v = await s.play('engine', { vol: 0.8, pan: -0.3, rate: 1.06, loop: true });
v.set({ rate: 1.2 });    // retune while it plays
v.stop();                // short fade-out, no click
```

| option | default | |
|---|---|---|
| `vol` | `1` | linear gain; `1` is the sound as recorded (clamped to 0–8) |
| `pan` | `0` | `-1` left to `1` right, equal-power |
| `rate` | `1` | playback speed, which moves pitch with it: `2` is an octave up and twice as fast (clamped to 0.0625–16) |
| `loop` | `false` | repeat until stopped |

The pan law is the one Web Audio's `StereoPannerNode` uses, and the Linux mixer matches it, so the same numbers sound the same on every OS.

`play()` rejects for a name that isn't loaded. It never rejects for "too many": the mixer plays up to 32 voices, and starting a 33rd fades out the oldest one. You don't need to keep the handle for a one-shot sound.

The voice handle:

| | |
|---|---|
| `v.id` | the voice's number |
| `v.set({ vol, pan, rate })` | change any of them while it plays, no restart |
| `v.stop()` | fade it out quickly |

Calls on a voice that has finished do nothing.

## the whole mixer {#mixer}

```js
s.master(0.5);     // one gain over everything (linear, default 1, clamped to 0–8)
s.stopAll();       // fade out every voice
s.unload('coin');  // free its decoded audio; voices playing it stop at once, without a fade
```

## per-OS notes {#os}

- **macOS and Windows**: the mixer lives in the main window's page. If that page reloads, tinyjs loads the same sounds again by itself (and restores `master`), so later `play()` calls work without any code of yours — but voices sounding at the moment of the reload stop.
- **Linux**: the launcher decodes, so sound effects don't depend on GStreamer plugins the way `<audio>` does. An active [filter chain](./audio) applies to the sampler like everything else the app plays.

## in the backend {#backend}

`app.audio.sampler` drives the same mixer. `load()` and `play()` return promises; `set()`, `stop()`, `stopAll()`, `master()` and `unload()` return `true` immediately. The backend has one extra call, `app.audio.sampler.stop(id)`, which stops a voice by its id — useful when a page started it and told you the id.

```js
// src/backend/main.js
export async function init(app) {
  const dir = (await app.paths()).resources;
  await app.audio.sampler.load('ding', dir + '/ding.wav');
}

export function onNotificationClick(id, app) {
  app.audio.sampler.play('ding');
}
```

In an [`api`](./config#api) gate, the calls are `sampler.load`, `sampler.play`, `sampler.set`, `sampler.stop`, `sampler.stopAll`, `sampler.master` and `sampler.unload`.
