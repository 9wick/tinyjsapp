---
title: "audio tap"
---

# audio tap

<p class="tagline">tiny.audioTap — read the audio being played, for meters and visualizers</p>

`tiny.audioTap` hands you the audio your app (or the whole system) is actually playing, as raw samples, in step with what the user hears. Use it for level meters, spectrum displays and visualizers — including for audio that never passes through Web Audio, such as native HLS, a cross-origin stream, or other apps.

It only observes. To change the sound, the audio has to go through a [filter chain](./audio) or a Web Audio graph instead.

The tap must be declared in tinyjs.json with [`audioTap`](./config#audioTap) — `"app"` for your own output, `"system"` for everything:

```json
{ "audioTap": "app" }
```

Only a page can start the tap. Once it runs, chunks reach every window and the backend's `onAudioTap(chunk, app)` export (see [hooks](./backend#hooks)).

```js
await tiny.audioTap.start({ scope: 'app' });
tiny.audioTap.on((chunk) => updateMeter(chunk));   // decoding: see below
```

## starting and stopping {#start}

```js
try {
  await tiny.audioTap.start({ scope: 'app', interval: 80 });
} catch (e) {
  showMeterUnavailable(e.code);
}
```

| option | default | |
|---|---|---|
| `scope` | `'app'` | `'app'`: this app's output. `'system'`: everything the computer plays |
| `excludeSelf` | `false` | with `scope: 'system'`, leave this app's own output out (macOS only) |
| `interval` | `80` | milliseconds of audio per chunk, clamped to 20–500 |

`start()` resolves `true`, or rejects with an `Error` whose `code` is:

| `code` | |
|---|---|
| `'not-declared'` | tinyjs.json has no `audioTap`, or asks for `"app"` while you started `scope: 'system'` |
| `'unsupported'` | the OS can't tap: macOS older than 14.2, or Linux without `pw-cat` or `parec` |
| `'failed'` | the tap couldn't be set up — for example a Core Audio error on macOS, or the capture tool failing to start on Linux |

There is one tap per app. Calling `start()` again restarts it with the new options (on macOS, the same options again are a no-op). The tap stops when you call `tiny.audioTap.stop()` (from any window) or when the window that started it closes.

Declaring `audioTap` asks for nothing by itself — permission is requested by the first `start()`. So you can wait until a meter first appears on screen before starting the tap.

## reading chunks {#chunks}

`tiny.audioTap.on(fn)` calls `fn` with each chunk and returns a function that removes the handler.

| field | |
|---|---|
| `pcm` | base64 of interleaved, little-endian, 16-bit signed samples |
| `sampleRate` | samples per second, e.g. `48000` |
| `channels` | interleaved channels, usually `2` |
| `frames` | samples per channel in this chunk |
| `t` | a monotonic time, in milliseconds, for the chunk's first sample |

Decode a chunk into floats from −1 to 1:

```js
function samples({ pcm }) {
  const bytes = Uint8Array.from(atob(pcm), (c) => c.charCodeAt(0));
  const ints = new Int16Array(bytes.buffer);
  return Float32Array.from(ints, (v) => v / 32768);
}

tiny.audioTap.on((chunk) => {
  const s = samples(chunk);
  let peakL = 0, peakR = 0;
  for (let i = 0; i < s.length; i += chunk.channels) {
    peakL = Math.max(peakL, Math.abs(s[i]));
    peakR = Math.max(peakR, Math.abs(s[i + 1] ?? s[i]));
  }
  drawMeter(peakL, peakR);
});
```

Chunks keep arriving at the same pace while nothing plays; they're silent.

In a page, the same chunks are the `'audio-tap'` event on `tiny.api.on`.

## per OS {#os}

| | `scope: 'app'` | `scope: 'system'` | `excludeSelf` | permission prompt |
|---|---|---|---|---|
| macOS | the app's own audio | everything | yes | yes |
| Windows | everything (the whole mix) | everything | ignored | no |
| Linux | the app's own audio with PipeWire's tools; otherwise everything | everything | ignored | no |

**macOS** uses Core Audio process taps. The first `start()` asks for "System Audio Recording" — even with `scope: 'app'`, because WebKit plays your page's audio from a separate helper process, so tapping it is capturing another process. The grant is remembered per app. Set the wording of the prompt with [`audioTapReason`](./config#audioTapReason).

If the user refuses, `start()` still succeeds and the chunks are all zeros: macOS doesn't report the refusal. A meter that never moves while audio is playing is the sign.

**Windows** captures the whole output mix with WASAPI loopback. There's no per-app capture yet, so `scope: 'app'` gets everything — fine for an app metering itself, since its audio is in the mix — and `excludeSelf` can't be honoured.

**Linux** captures from PipeWire or PulseAudio. For `scope: 'app'`, it needs `pw-cli`, `pw-link` and `pw-cat`: it creates a private sink named `tinyjs-tap-<pid>`, copies your app's streams into it, and records that. Without those tools it records the whole mix instead. If the capture tool exits, the tap stops and chunks stop arriving. `tiny.system.requirements(['audioTap'])` reports whether a capture tool is installed and how to install one.

## in development {#dev}

Under `tinyjs dev` on macOS, the process macOS treats as the owner of your app is the terminal you ran it from. The tap delivers real samples only if that terminal has the System Audio Recording grant; otherwise it delivers silence. `scope: 'app'` can also pick up other audio started from the same terminal. A built `.app` owns its grant and its audio.

## in the backend {#backend}

The backend can't start or stop the tap, but it receives every chunk:

```js
// src/backend/main.js
export function onAudioTap({ pcm, sampleRate, channels, frames, t }, app) {
  // e.g. compute a level and push it to a tray-only window
}
```

In an [`api`](./config#api) gate, the calls are `audioTap.start` and `audioTap.stop`.
