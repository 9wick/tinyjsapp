---
title: "Introduction"
---

# Introduction

Everything a tinyjs app can do. Frontend calls live under `window.tiny`; the backend gets the same calls on its `app` handle, by the same names — the [API map](./api-map) lists every one side by side.

tinyjs makes desktop apps for macOS, Windows and Linux. Where an OS can't do something, the call says so in these docs and rejects or answers `'unsupported'` at runtime, so cross-platform code can feature-detect — see [portability](./portability).

Phones aren't on the roadmap. If you need iOS or Android, [Tauri](https://tauri.app) is a good fit.

## quick start {#quick-start}

[Install tinyjs](./install), then:

```sh
tinyjs new myapp     # a working app: a page, a backend, a tinyjs.json
cd myapp
tinyjs dev           # opens it; edits reload as you save
tinyjs build         # the app to share, in dist/
```

The page is `src/frontend/`, the backend `src/backend/main.js`. They talk like this:

```js
// src/backend/main.js
export const api = {
  greet: ({ name }) => `Hello, ${name}!`,
};
```

```js
// src/frontend/app.js
tiny.api.call('greet', { name: 'world' }).then((message) => {
  document.body.append(message);   // "Hello, world!"
});
```

Then build a real one: [your first app](./first-app) is a notebook that saves to disk, step by step. For a Vite + React, Vue or Svelte app, use [`tinyjs new myapp --template`](./cli#new).
