---
title: "audio filters"
---

# audio filters

<p class="tagline">tiny.audio — an EQ on your app's own output</p>

`tiny.audio` runs a chain of filters — a graphic EQ, headphone correction, a crossover — on everything your app plays. On macOS and Linux the chain runs natively, below the webview, so it reaches audio the page never gets samples for (native HLS, a cross-origin `<audio>` element), and it keeps running across page reloads. Where the native chain doesn't exist (Windows), `tiny.audio.pageChain(ctx)` builds the same chain from Web Audio nodes, with the same calls.

The backend has the same calls on `app.audio`.

```js
await tiny.audio.filters([
  { type: 'peaking', freq: 60, q: 1.1, gain: 4 },
  { type: 'highshelf', freq: 8000, q: 0.7, gain: -2 },
]);
```

## choosing a backend {#choose}

Ask `tiny.system.capabilities()` once, then use the same calls either way:

```js
const can = await tiny.system.capabilities();
const eq = can.audioFilters ? tiny.audio : tiny.audio.pageChain(ctx);

if (eq.input) {                       // page chain: route your audio through it
  source.connect(eq.input);
  eq.output.connect(ctx.destination);
}
await eq.filters(bands);              // identical from here on
```

| | `audioFilters` | where it runs |
|---|---|---|
| macOS 14.2 and later | `true` | a Core Audio process tap in the launcher |
| Linux | `true` | a PipeWire filter-chain |
| Windows | `false` | use `pageChain` |

Windows has no native chain on purpose. Filtering there means turning down the app's own session volume, and Windows saves that volume under a key every WebView2 app shares — a crash mid-filter would leave all of them nearly silent. Web Audio works well on Windows, so `pageChain` is the route. Calling `tiny.audio.filters()` on Windows resolves but does nothing.

Don't use `pageChain` on Linux: any Web Audio graph that reaches `ctx.destination` crackles under WebKitGTK, which is why the native chain exists there.

## filters {#filters}

Each filter is an object:

| field | |
|---|---|
| `type` | one of the types below |
| `freq` | centre or corner frequency in Hz (default 1000) |
| `q` | quality factor (default 1) |
| `gain` | dB for the biquad types (default 0, flat); a linear multiplier for `'gain'` (default 1, unchanged) |
| `gainR` | the right channel's gain, when it differs from the left — native only |

| type | |
|---|---|
| `peaking` | boost or cut around `freq` |
| `lowshelf`, `highshelf` | boost or cut below / above `freq` |
| `lowpass`, `highpass` | cut above / below `freq` |
| `bandpass` | pass a band around `freq` |
| `notch` | cut a narrow band at `freq` |
| `allpass` | change phase only |
| `gain` | multiply by `gain` — a preamp. `1` leaves the level alone, `0.5` is −6 dB |

Filters run in the order given. All the biquads use the same RBJ cookbook formulas on every backend, so the same numbers give the same curve on macOS, Linux and in `pageChain`.

## setting the chain {#set}

`filters(list)` sets the whole chain; `[]` removes it and restores unprocessed output.

```js
await tiny.audio.filters([
  { type: 'gain', gain: 0.8 },                       // preamp
  { type: 'peaking', freq: 60, q: 1.1, gain: 4 },
  { type: 'peaking', freq: 1000, q: 1, gain: -1.5 },
  { type: 'highshelf', freq: 8000, q: 0.7, gain: -2 },
]);
```

If the new list has the same types in the same order as the current one, the native chain retunes in place. If the shape changes — a filter added, removed or of a different type — it's rebuilt, which can leave a short gap.

`filter(index, patch)` changes one filter in place. The patch merges onto what you set, so pass only what changed. This is what a slider should call:

```js
slider.oninput = () => tiny.audio.filter(1, { gain: Number(slider.value) });
```

A patch that changes `type` or `gainR` rebuilds the chain instead. An index past the end of the chain is ignored.

### limits {#limits}

Long lists are cut short, without an error:

- **Linux**: 28 filters, or 15 if any filter has `gainR`. PipeWire's filter-chain crashes past about 30 nodes, and a split left/right filter costs two.
- **macOS**: 32 filters.

## balance {#balance}

`balance(v)` pans the chain's output from `-1` (left) through `0` to `1` (right). It costs no filter slot and never rebuilds the chain. On the native backends it needs an active chain — a `filters()` call with at least one filter — so an app that wants balance with no EQ can keep one flat filter in place:

```js
await tiny.audio.filters([{ type: 'gain', gain: 1 }]);
await tiny.audio.balance(-0.3);
```

`gainR` is the other way to get a left/right difference, folded into a filter you already have — `{ type: 'gain', gain: 1, gainR: 0.4 }` is quieter on the right. It's native only.

`clear()` removes every filter and centres the balance.

## the page chain {#pageChain}

`tiny.audio.pageChain(ctx)` builds the chain from Web Audio nodes in an `AudioContext` you own and returns an object with `input` and `output` gain nodes plus the same four calls:

```js
const ctx = new AudioContext();
const audio = document.querySelector('audio');
const eq = tiny.audio.pageChain(ctx);

ctx.createMediaElementSource(audio).connect(eq.input);
eq.output.connect(ctx.destination);

eq.filters([{ type: 'lowshelf', freq: 120, gain: 3 }]);
eq.filter(0, { gain: 5 });    // ramps over ~15 ms, no zipper noise
eq.balance(0.2);
eq.clear();
```

Its calls return `true` synchronously rather than a promise; `await` works on both.

How it differs from the native chain:

- It filters only what you connect to `input`. Audio the page has no samples for — native HLS, a cross-origin `<audio>` without CORS — never reaches it. [`tiny.proxyURL`](./fetch) can bring a cross-origin stream into Web Audio.
- Shelf filters ignore `q` (Web Audio's shelves have a fixed slope).
- `gainR` is ignored; use `balance()`.
- `filters()` always rebuilds the node graph, even with the same shape. Use `filter()` for live changes; it rebuilds only when you change a filter's `type`.
- It lives in the page, so it goes when the page reloads.

## macOS {#macos}

The native chain on macOS takes the app's audio off the speakers through a Core Audio process tap, filters it, and plays it back. That needs the "System Audio Recording" permission, which only a packaged app can be granted. Until it's granted — and always under `tinyjs dev` — the chain stays idle and audio plays unfiltered. It never goes silent: the tap mutes your app's audio only once filtered audio is actually flowing.

Sounds from [`app.playSound`](./shell) play from the launcher itself and aren't filtered.

## Linux {#linux}

The chain is a PipeWire filter-chain node named `tinyjs-eq-<pid>`, private to your app. It also filters the [sound effects mixer](./sampler).

## in the backend {#backend}

`app.audio.filters()`, `filter()`, `balance()` and `clear()` work the same as the page's calls and drive the same chain, but return nothing rather than a promise. `pageChain` is page only.

The old names `app.setAudioFilters()`, `app.setAudioFilter()` and `app.setAudioBalance()` still work and log a deprecation notice once.

In an [`api`](./config#api) gate, the calls are `audio.filters`, `audio.filterSet` and `audio.balance`.
