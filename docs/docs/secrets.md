---
title: "secrets & auth"
---

# secrets & auth

<p class="tagline">tiny.app.secrets and tiny.app.authenticate — the OS keychain, not your JSON</p>

API tokens, refresh tokens and passwords belong in the operating system's credential store, which encrypts them and ties them to the user's login. `tiny.app.secrets` reads and writes it. Don't put them in [`tiny.store`](./store): that's a plain JSON file anyone with access to the account can read.

`tiny.app.authenticate` asks the user to prove it's them — Touch ID, Windows Hello, or their account password — before you show or use something sensitive.

In the backend these are `app.secrets` and `app.authenticate`, with the same calls.

## storing a secret {#secrets}

```js
await tiny.app.secrets.set('api-token', token);

const saved = await tiny.app.secrets.get('api-token');   // string, or null
if (saved === null) showSignIn();

await tiny.app.secrets.delete('api-token');              // on sign-out
```

| call | resolves to |
|---|---|
| `secrets.get(key)` | the stored string, or `null` if nothing is saved under `key` |
| `secrets.set(key, value)` | `true`. Replaces an existing value rather than adding a second one |
| `secrets.delete(key)` | `true`, including when nothing was saved under `key` |

Values are strings; anything else is converted with `String()`, so store an object as `JSON.stringify(obj)` and parse it on the way out. Secrets are filed under the app's [`id`](./config#id), so each app has its own and they survive updates and reinstalls.

Where they go:

| OS | store | filed as |
|---|---|---|
| macOS | the login Keychain | a generic password: service = app id, account = key |
| Windows | Credential Manager | a generic credential named `<id>/<key>` |
| Linux | the Secret Service over D-Bus (GNOME Keyring, for example) | an item in the default collection labelled `<id>/<key>` |

## when it fails {#errors}

Unlike most `tiny` calls, the secrets calls **reject** when the credential store doesn't answer, with the reason as a string:

- **Linux with no Secret Service running** (a minimal window manager, a container): every call rejects with `no secret service`.
- **Windows**: Credential Manager holds at most 2560 bytes per value, counted as UTF-8. A larger `set` rejects and says so. (The macOS Keychain has no such small limit.)
- Any other failure rejects with a short reason, such as `keychain error -25308` on macOS or `credential write failed (5)` on Windows.

A missing key is not an error: `get` resolves `null`.

```js
let token = null;
try {
  token = await tiny.app.secrets.get('api-token');
} catch (msg) {
  // no keychain available: ask each time, or explain why sign-in won't stick
}
```

`tiny.system.capabilities().secrets` is `true` on Linux and absent (meaning supported) elsewhere; it doesn't tell you whether a Secret Service is running, so catch the rejection.

## developing on macOS {#macos-dev}

The Keychain grants access to the program that saved a value. A secret saved while running under `tinyjs dev` belongs to the dev launcher, so the built app asks the user for permission the first time it reads it — and a rebuild changes the app's signature, so it may ask again. Real users, who only ever run the built app, don't see this; you will while developing.

## asking the user to authenticate {#authenticate}

`tiny.app.authenticate(reason?)` shows the system's own prompt and resolves `true` if the user passed it, `false` otherwise. It never rejects: cancelling, failing, and having no way to authenticate all resolve `false`.

```js
async function revealPassword(entry) {
  if (!(await tiny.app.authenticate('show the password for ' + entry.name))) return;
  passwordField.textContent = await tiny.api.call('readPassword', { id: entry.id });
}
```

`reason` is shown in the prompt, and defaults to `'authenticate'`. macOS puts it after "*App* is trying to", so phrase it as the end of that sentence.

| OS | prompt |
|---|---|
| macOS | Touch ID, or the account password where there's no Touch ID |
| Windows | Windows Hello: fingerprint, face or PIN. Resolves `false` if Hello isn't set up |
| Linux | none yet — always resolves `false` |

Check before offering the option:

```js
const caps = await tiny.system.capabilities();
if (caps.authenticate !== false) lockButton.hidden = false;
```

`authenticate` only answers yes or no; it doesn't unlock anything by itself. If you gate a secret behind it, do the check where the secret is read. A check in the page alone can be skipped by anything that can call the backend directly.

## under an api gate {#gate}

The calls are `secrets.get`, `secrets.set`, `secrets.delete` and `app.authenticate` to the [`api`](./config#api) gate in tinyjs.json. The `"wrapper"` preset leaves them all off, so a site you [wrap](./site-wrappers) can't read the app's secrets unless you enable `secrets.*` for it. Keep tokens in the backend and use them there, as in [site wrappers](./site-wrappers), rather than handing them to the page.
