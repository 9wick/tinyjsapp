---
title: "cookies"
---

# cookies

<p class="tagline">app.cookies — the webview's cookie jar, backend only</p>

Every window in your app shares one cookie jar: the webview's own, the one a page's requests and a [wrapped site](./site-wrappers)'s sign-in use. `app.cookies` lets the [backend](./backend) read and change it — HttpOnly cookies included — to keep someone signed in across reinstalls, sign them out, or hand a session to another part of your app.

It's backend only, and there's no page-side version: a page that could read the jar could read every site's session. If a page needs a cookie's value, return it from an [`api` function](./backend#api) of your own.

## reading cookies {#get}

```js
const cookies = await app.cookies.get({ url: 'https://app.example.com' });
const [sid] = await app.cookies.get({ url: 'https://app.example.com', name: 'sid' });
```

`get(filter?)` resolves to an array of cookies:

| field | |
|---|---|
| `name`, `value` | |
| `domain` | a leading `.` means the domain and its subdomains; without one the cookie is host-only |
| `path` | |
| `expires` | milliseconds since the epoch, or `null` for a session cookie |
| `secure`, `httpOnly` | |
| `sameSite` | `'lax'`, `'strict'` or `'none'` — see [SameSite](#samesite) |

Filter by `name`, `domain` or `path`. With `url`, you get exactly the cookies a request to that URL would carry (matching domain, path and `secure`). Without `url`, `get()` returns the whole jar — on Linux that needs WebKitGTK 2.42 or newer.

## setting a cookie {#set}

```js
await app.cookies.set({
  url: 'https://app.example.com',
  name: 'theme',
  value: 'dark',
  expires: Date.now() + 365 * 24 * 3600 * 1000,
});
```

`set(cookie)` replaces any cookie with the same name, domain and path, and resolves `true`.

| field | |
|---|---|
| `name`, `value` | required |
| `url` | where it belongs. `url` alone makes the cookie host-only for that host |
| `domain` | `'.example.com'` covers subdomains. Needed when there's no `url` |
| `path` | default `/` |
| `expires` | a `Date` or milliseconds since the epoch. Leave it out for a session cookie |
| `secure`, `httpOnly` | |
| `sameSite` | default `'lax'` |

## removing cookies {#remove}

```js
await app.cookies.remove({ url: 'https://app.example.com' });             // sign out: all of them
await app.cookies.remove({ name: 'sid', domain: '.example.com' });        // one, e.g. straight from get()
```

`remove(target)` resolves to the number of cookies removed. Pass either a cookie's `name` and `domain` (and `path`, default `/`) — what `get()` returns — or a `url`, with an optional `name`, to remove everything `get({ url, name })` would match.

## keeping a session {#session}

A wrapped site's session lives in its cookies. To keep someone signed in after the app's data is reset, or move a session between machines, save the cookie somewhere safe and put it back later — [secrets](./secrets) is the place for anything that grants access:

```js
// backend
const SITE = 'https://app.example.com';

export const api = {
  saveSession: async (_, app) => {
    const [sid] = await app.cookies.get({ url: SITE, name: 'sid' });
    if (sid) await app.secrets.set('sid', JSON.stringify(sid));
  },
  restoreSession: async (_, app) => {
    const saved = await app.secrets.get('sid');
    if (saved) await app.cookies.set({ url: SITE, ...JSON.parse(saved) });
  },
  signOut: async (_, app) => {
    await app.cookies.remove({ url: SITE });
    await app.secrets.delete('sid');
  },
};
```

## SameSite {#samesite}

`set()` defaults `sameSite` to `'lax'` on every OS, because the engines disagree about a cookie without one. `get()` reports what the engine actually enforces, so a cookie a site set without SameSite reads as `'none'` on macOS, `'lax'` on Windows, and either on Linux depending on the WebKitGTK version. Passing a `get()` result straight back to `set()` keeps it behaving the same way. `'none'` generally needs `secure: true` to be sent cross-site.

## errors {#errors}

The calls reject when a name or value contains a control character or `;`, when a `url` isn't `http://` or `https://`, or when `set()` has no `name`.

[`tiny.fetch`](./fetch) is a separate client: it doesn't send the jar's cookies. Set a `Cookie` header yourself if you need one there.
