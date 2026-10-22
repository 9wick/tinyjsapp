---
title: "shared code"
---

# shared code

<p class="tagline">code both sides import</p>

Constants, validation or formatting that the [backend](./backend) and the page both use go in a `shared/` folder beside the backend's folder. Both sides import it by the same relative path, in `tinyjs dev` and in a build.

```text
myapp/
  src/
    backend/main.js
    frontend/app.js
    shared/settings.js
```

```js
// src/shared/settings.js
export const MAX_TITLE = 80;
export const validTitle = (t) => t.length > 0 && t.length <= MAX_TITLE;
```

```js
// src/backend/main.js and src/frontend/app.js alike
import { validTitle } from '../shared/settings.js';
```

The folder goes next to the backend's: `src/shared/` beside `src/backend/`, or `shared/` at the project root in the Vite templates, whose backend is `backend/`. A plain page loads it with `<script type="module">`; a bundled frontend (Vite) pulls it into its own bundle.

## rules

- **Plain `.js` modules** (ES modules, `export`/`import`).
- **Nothing secret.** The folder ships as plain files next to the page, so the page — and anyone who opens the app's files — can read it.
- **No `tjs:*` imports.** The page doesn't have txiki.js; anything that touches files, processes or the network belongs in the backend.

In `tinyjs dev`, editing a shared file restarts the app, since the backend uses it too.

Projects from before 0.52 (`src/main.js`, with the frontend inside `src/`) can't use `src/shared/` — `tinyjs dev` says so. Move `src/main.js` and the files it imports into `src/backend/` first.
