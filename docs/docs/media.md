---
title: "media"
---

# media

<p class="tagline">tiny.app.nowPlaying, tiny.app.say — Now Playing and speech</p>

This page covers the calls a media app reaches for: showing what's playing in the system's media controls, receiving the media keys, and speaking text aloud. It ends with screen recording on macOS.

Each has a backend twin under the same name on `app` — `app.nowPlaying`, `app.say()` — and media keys have a backend hook, `onMediaKey` (see [hooks](./backend#hooks)). Notifications are on their own page: [notifications](./notifications).

## Now Playing and media keys {#now-playing}

`tiny.app.nowPlaying.set(info)` puts your track in the system's media controls and routes the media keys to your app; `onMediaKey(fn)` receives them.

```js
await tiny.app.nowPlaying.set({
  title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue',
  duration: 337, elapsed: 12, playing: true,
});

tiny.app.onMediaKey(({ command, time }) => {
  if (command === 'toggle') player.paused ? player.play() : player.pause();
  if (command === 'play') player.play();
  if (command === 'pause') player.pause();
  if (command === 'next') nextTrack();
  if (command === 'previous') previousTrack();
  if (command === 'seek') player.currentTime = time;
});
```

| `info` field | |
|---|---|
| `title`, `artist`, `album` | strings |
| `duration` | track length in seconds |
| `elapsed` | position in seconds |
| `playing` | playing or paused |

Call `set()` again whenever any of it changes: a new track, play/pause, a seek. Pass `playing` every time — when it's left out, macOS shows paused and Linux shows playing. `tiny.app.nowPlaying.clear()` removes the entry and releases the keys.

`onMediaKey(fn)` gets `{ command, time }`, where `command` is `'play'`, `'pause'`, `'toggle'`, `'next'`, `'previous'` or `'seek'`, and `time` is the seek target in seconds (only for `'seek'`). It returns a function that removes the handler. In a page, the same event is `'media-key'` on `tiny.api.on`.

| | Now Playing | media keys |
|---|---|---|
| macOS | Control Center and the lock screen | the keyboard's media keys, headphone buttons, Control Center; `seek` from scrubbing there |
| Linux | an MPRIS player named `org.mpris.MediaPlayer2.<app id>`, shown by the desktop's media controls | MPRIS commands; Stop arrives as `'pause'`, and a relative seek as `'seek'` with an absolute `time` |
| Windows | not yet | not yet |

On Windows, `capabilities().nowPlaying` and `capabilities().mediaKeys` are `false`, and `set()` does nothing. A playing `<audio>` or `<video>` element registers with Windows's media controls by itself, and play/pause works through it. For next and previous, register them with the web's own API, which works on every OS:

```js
navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
navigator.mediaSession.setActionHandler('previoustrack', previousTrack);
navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album });
```

The backend's `app.nowPlaying.set()` and `clear()` return `true` immediately.

## speech {#speech}

`tiny.app.say(text, opts)` speaks with a system voice and resolves when it has finished speaking:

```js
const voices = await tiny.app.voices();
const voice = voices.find((v) => v.lang.startsWith('en'))?.id;

const done = await tiny.app.say('Export finished', { voice, rate: 0.5 });
// done: true if it finished, false if it was stopped (or speech is unavailable)

tiny.app.stopSpeaking();
```

| option | |
|---|---|
| `voice` | a voice `id` from `voices()`; on macOS and Linux also a language like `'en-AU'` |
| `rate` | `0`–`1`, about `0.5` is normal speed |

`voices()` resolves to `[{ id, name, lang, quality }]`, where `quality` is `'default'`, `'enhanced'` or `'premium'`.

| | engine | notes |
|---|---|---|
| macOS | the system speech synthesizer | enhanced and premium voices need a download in System Settings ▸ Accessibility ▸ Spoken Content. A second `say()` queues behind the first. |
| Windows | SAPI | `voice` must be an id from `voices()`. `lang` is Windows's own language code (e.g. `'409'` for US English), and every `quality` is `'default'`. A new `say()` cuts off the current one (which resolves `false`, as a stopped one does). |
| Linux | speech-dispatcher (`spd-say`) | without it installed, `say()` resolves `false` and `voices()` resolves `[]`. `tiny.system.requirements(['speech'])` tells the user what to install. `quality` is always `'default'`. |

The backend's `app.stopSpeaking()` returns `true` immediately; `say()` and `voices()` return promises.

## screen recording (macOS) {#recorder}

`tiny.macos.recorder` records a display to an `.mp4` file. Video only — there is no audio track — and one recording at a time. It needs macOS 14 and the `'screen'` [permission](./permissions); on Windows and Linux it rejects (`capabilities().recorder` is `false`).

```js
await tiny.macos.recorder.start({ path: '/tmp/demo.mp4' });   // screenId optional
// …
const { path, duration } = await tiny.macos.recorder.stop();  // the finished file
```

`start({ path, screenId })` resolves once recording is running, and rejects with the reason (no permission, no `path`, an older macOS). `screenId` is an `id` from `tiny.app.screens()`; without it, the first display macOS lists is recorded. `stop()` resolves to `{ path, duration }` (seconds) once the file is complete. See [macOS only](./macos-only) for the rest of `tiny.macos`.

## in a site wrapper {#api-gate}

In an [`api`](./config#api) gate these calls are `nowplaying.set`, `nowplaying.clear`, `app.say`, `app.stopSpeaking`, `app.voices`, `macos.recorder.start` and `macos.recorder.stop`. The `"wrapper"` preset allows `nowplaying.*`.
