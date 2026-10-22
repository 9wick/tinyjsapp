---
title: "store"
---

# store

<p class="tagline">tiny.store — persistent settings</p>

`tiny.store` keeps small values between runs: preferences, the last folder opened, a window layout of your own. It's a set of flat keys with JSON values, saved to one `store.json` file for the app, and every window and the backend see the same values. In the backend it's `app.store`, with the same calls.

```js
const theme = (await tiny.store.get('theme')) ?? 'system';
await tiny.store.set('theme', 'dark');
```

For tokens and passwords use [secrets](./secrets) instead: `store.json` is a plain file anyone with access to the account can read. For data you query, or anything that grows, use a [sqlite](./sqlite).

## reading and writing {#calls}

| call | resolves to |
|---|---|
| `tiny.store.get(key)` | the value, or `null` if the key isn't set |
| `tiny.store.set(key, value)` | `true` once saved to disk, `false` if the save failed |
| `tiny.store.delete(key)` | `true` once saved, `false` if the save failed; deleting a key that isn't set is fine |
| `tiny.store.all()` | every key and value, as an object |

```js
await tiny.store.set('recent', ['/Users/me/a.md', '/Users/me/b.md']);
await tiny.store.set('window', { sidebar: true, width: 280 });

const { sidebar } = (await tiny.store.get('window')) ?? { sidebar: true };
await tiny.store.delete('recent');
```

Values must survive JSON: a `Date` comes back as a string, a `Map` or `Set` as `{}`. Storing `null` or `undefined` reads back as `null`, the same as a key that was never set.

## when a save fails {#failures}

The store works like `localStorage`: the values live in memory, and `set` and `delete` take effect at once, then save the file. `get` and `all` see a change immediately, even before it's on disk.

The calls never reject, so an un-awaited `set` can't crash anything. A failed save (a full disk, no permission) resolves `false` — which `localStorage` never tells you. The value stays in memory, `get` returns it, and the next successful save writes it, but it's lost if the app quits first. To retry, set the same value again rather than redoing a read-modify-write, which would apply the change twice:

```js
const next = (await tiny.store.get('launches')) + 1;
if (!(await tiny.store.set('launches', next))) {
  // retry with the same value, not with get() + 1 again
  await tiny.store.set('launches', next);
}
```

Each save writes a temporary file and renames it over `store.json`, so a crash mid-save leaves the old file whole.

## where it's kept {#where}

`store.json` sits in the app's data folder, [`paths().data`](./shell):

- macOS: `~/Library/Application Support/<id>/store.json`
- Windows: `%APPDATA%\<id>\store.json`
- Linux: `~/.local/share/<id>/store.json` (or under `$XDG_DATA_HOME`)

The folder is named after the app's [`id`](./config#id), so the store survives updates and each app has its own. Changing the `id` after release starts users over with an empty store.

Things to know about the file:

- **It's read once**, the first time any store call runs, and kept in memory after that. Editing `store.json` while the app runs doesn't change what the app sees, and the app's next save overwrites your edit.
- **A file that isn't valid JSON** reads as empty, and the next save replaces it.
- **tinyjs keeps a few keys of its own** in the same file, all starting with `__` (for example `__screens`, used to put windows back on screen after a display change). They show up in `all()`. Don't use keys starting with `__` for your own values.

## under an api gate {#gate}

The four calls are `store.get`, `store.set`, `store.delete` and `store.all` to the [`api`](./config#api) gate in tinyjs.json, so `"store.*"` allows all of them. The `"wrapper"` preset includes them, which means a site you [wrap](./site-wrappers) can read and change every key — keep anything that site shouldn't see out of the store.
