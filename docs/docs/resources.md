---
title: "resources"
---

# resources

<p class="tagline">data your code reads</p>

Data your own code reads at runtime — a dictionary, fonts, templates, a model — goes in a `resources/` folder. The whole folder ships with the app, and `paths().resources` points at it: the folder itself in `tinyjs dev`, the bundled copy in a build. The same relative paths work in both, wherever the app is installed or launched from.

```text
myapp/
  resources/
    dictionary.json
    fonts/
```

In the [backend](./backend):

```js
export async function init(app) {
  const root = (await app.paths()).resources;   // string, or null with no resources/
  if (root === null) return;
  const bytes = await tjs.readFile(root + '/dictionary.json');
  console.log(new TextDecoder().decode(bytes));
}
```

The page gets the same path from `await tiny.app.paths()`. Reading the files is still the backend's job: resources don't widen what the page may load. Expose what the page needs through your [backend API](./api).

## where it ends up {#where}

- **macOS**: inside the app, at `Contents/Resources/app/resources/`.
- **Windows, Linux**: a `resources/` folder beside the executable in `dist/`.

The files stay as plain files (not packed into the executable), and [`tinyjs publish`](./cli#publish) archives and updates include them. With no `resources/` folder, or `"resources": []`, nothing ships and the path is `null`.

## shipping part of it {#list}

To ship only some of the folder, list paths inside it with [`resources`](./config#resources). A list narrows builds only — `tinyjs dev` always sees the whole folder.

```json
{ "resources": ["dictionary.json", "fonts/"] }
```

For different files per OS, put a list in a [per-OS block](./config#per-os-overrides). An OS's list replaces the root one (it doesn't add to it), and an OS without its own list uses the root's — so to give one OS a file the others don't get, empty the root list:

```jsonc
{
  "resources": [],                             // Windows, Linux: nothing
  "macos": { "resources": ["mac-only.png"] }   // macOS: just this
}
```

## rules {#rules}

The build fails on a listed path that doesn't exist, absolute, drive and UNC paths, `..`, and symlinks (including `resources/` itself). On Windows, path parts can't end in a dot or a space.

Programs your backend runs go in [executables](./executables) instead; files for the person downloading the app, in [extras](./extras).
