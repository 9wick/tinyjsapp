---
title: "signed updates"
---

# signed updates

<p class="tagline">updates only you can publish</p>

A plain [auto-update](./auto-update) manifest is trusted because it comes over https, and the archive because its sha256 matches the manifest. Both live on the same host, so anyone who controls that host (or the bucket or CDN behind it) can swap in their own build and its matching hash.

Signed updates close that gap. You pin one or more Ed25519 public keys in the app with [`update.publicKey`](./config#update), and `tinyjs publish` signs the manifest with a private key that never leaves your machine or CI secrets. The app checks the signature over the whole manifest (version, notes, every download url and sha256) before it reads anything from it. The https, sha256 and macOS code-signature checks all still apply.

This is separate from Apple and Windows code signing, and works the same on all three systems. It's opt-in: same `update.url`, and existing installs keep updating.

## setting it up {#setup}

### 1. create two keys {#keys}

Make two keys: one you sign with day to day, and a backup kept offline (a password manager, an encrypted USB stick), somewhere apart from the first. Apps accept a manifest signed by either, so if the signing key is lost or leaks, the backup can still ship updates, including the one that replaces the bad key. A key only helps once it's in installed apps, so pin the backup from your first signed release.

Use the `tjs` runtime bundled with tinyjs (`bin/tjs` in the tinyjs folder). In a private folder **outside your app project**, restrict new files to yourself (`umask 077` on macOS and Linux), save this as `keygen.js` and run `/path/to/tinyjs/bin/tjs run keygen.js`:

```js
for (const name of ['update', 'update-backup']) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  await tjs.writeFile(name + '-private.der',
    new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const publicKey = btoa(Array.from(raw, b => String.fromCharCode(b)).join(''));
  await tjs.writeFile(name + '-public.txt', new TextEncoder().encode(publicKey));
}
```

You get four files:

| file | what it is | where it goes |
|---|---|---|
| `update-private.der` | the signing key (PKCS8 DER) | private storage or a CI secret |
| `update-backup-private.der` | the backup key | offline, now |
| `update-public.txt`, `update-backup-public.txt` | base64 of the 32-byte raw public keys | tinyjs.json |

Never put a private key in tinyjs.json, your source or resource folders, version control or an uploaded release. Keep it outside the project: building copies backend sources into the app.

### 2. pin the public keys {#config}

```json
{
  "update": {
    "url": "https://example.com/myapp/manifest.json",
    "publicKey": ["BASE64_SIGNING_PUBLIC_KEY", "BASE64_BACKUP_PUBLIC_KEY"]
  }
}
```

A single string works for one key. The keys are built into the app.

### 3. publish with the private key {#publish}

```sh
TINYJS_UPDATE_PRIVATE_KEY_FILE=/private/keys/update-private.der tinyjs publish --notes "Fixes the export bug"
```

In PowerShell, set `$env:TINYJS_UPDATE_PRIVATE_KEY_FILE` first, then run `tinyjs publish`. The variable holds the file's path, not the key. In CI, point it at a secret file your CI provides.

`publish` checks the key before it builds anything:

- With `publicKey` set, it needs `TINYJS_UPDATE_PRIVATE_KEY_FILE`, and the key must match one of the listed public keys.
- With the variable set and no usable `publicKey`, it stops.
- A `publicKey` that's set but isn't a non-empty string or list (`""`, `[]`, a number) gets a note, and the manifest is published unsigned.

`tinyjs build` and `tinyjs dev` never need the private key.

### 4. upload {#upload}

Upload `dist/publish/` as usual: the archive plus `manifest.json`, under the filename `update.url` names. Download urls must still be https.

## what the app accepts {#rules}

Signing is on when `update.publicKey` is a non-empty string or a non-empty list of strings. Anything else (left out, `null`, `""`, `[]`) means unsigned updates.

With signing on, the app trusts only the `signed` block and fails closed. Each of these means no update, with an [error](#errors) from `check()` and `install()`:

- no `signed` block, or one with an unknown format or extra fields
- a signature that doesn't verify against any pinned key
- a pinned key that isn't valid base64 of 32 bytes, even if another key in the list would have matched
- an [expired](#expires) manifest
- a runtime without Ed25519 support (there's no unsigned fallback)

`check()` verifies the manifest before it picks this OS's entry. `install()` fetches and verifies it again rather than trusting the earlier check, and refuses anything that isn't newer or has no build for this OS and CPU. So if a newer, correctly signed manifest replaces the old one between the two calls, that's the one installed.

## the signed manifest {#format}

`publish` writes the usual manifest with a `signed` block added:

```json
{
  "version": "2.0.0",
  "url": "https://example.com/myapp/myapp-2.0.0.zip",
  "sha256": "…",
  "notes": "…",
  "signed": {
    "format": "tinyjs-update-v1",
    "algorithm": "Ed25519",
    "payload": "{\"version\":\"2.0.0\",\"url\":\"https://example.com/myapp/myapp-2.0.0.zip\",\"sha256\":\"…\",\"notes\":\"…\"}",
    "signature": "BASE64_64_BYTE_SIGNATURE"
  }
}
```

- Apps **without** a key read the plain fields, as they always have, and ignore `signed`.
- Apps **with** a key read only `payload`, after checking the signature. Editing the plain fields by hand changes what keyless apps see and nothing else.
- `payload` is the whole plain manifest as a JSON string: every platform block, url, hash and note is covered.
- The signed bytes are the UTF-8 of `"tinyjs-update-v1\n" + payload`. The payload isn't normalized, so changing even its whitespace breaks the signature.
- The `signed` block has exactly those four fields. Base64 is standard, with padding. The key always comes from the app, never from the manifest.

## expiry {#expires}

By default a signed manifest is valid forever. Someone who controls your host can't forge one, but they can keep serving an old one: holding users on an earlier release, or offering a superseded release to users still older than it. `--expires` puts a date inside the signed payload:

```sh
TINYJS_UPDATE_PRIVATE_KEY_FILE=… tinyjs publish --expires 30d          # or a date: 2027-01-31 (midnight UTC)
TINYJS_UPDATE_PRIVATE_KEY_FILE=… tinyjs publish --sign-manifest dist/publish/manifest.json --expires 30d
```

After that moment `check()` and `install()` reject with `update manifest expired …`, and automatic checks stay silent. The cost: re-sign before it runs out, or every installed app stops seeing updates until you do. The second command above extends an existing manifest without rebuilding (a scheduled CI job works). Re-signing without `--expires` keeps the old date.

Keep the window generous: a user whose clock is off by more than what's left is refused too. Apps without a key ignore `expires`, since anyone who could edit their manifest could edit the date.

## several platforms {#platforms}

Publishing a second Mac `--arch`, or a second Windows CPU, of the same version verifies the existing signed manifest in `dist/publish/`, merges the new build into it and signs the result. If the existing one doesn't verify it isn't merged; publish that build again.

Builds from different machines are merged by hand ([how](./auto-update#merging)). Sign after the final merge:

1. Merge the plain fields, then **delete the `signed` blocks**.
2. Check the version, notes and every url and sha256.
3. Sign it, from the app project with the pinned keys:

```sh
TINYJS_UPDATE_PRIVATE_KEY_FILE=/private/keys/update-private.der tinyjs publish --sign-manifest merged.json
```

`--sign-manifest FILE` doesn't build. It writes the `signed` block into the file. Given a file that already has one, it verifies it and re-signs the same data (to extend `--expires`, say). If the plain fields no longer match the signed block, it refuses rather than guess which you meant: delete the block to sign the plain fields as they are.

## existing installs {#existing-installs}

Nothing to migrate. Keep the same `update.url`, add `publicKey` and publish as usual. Installs from before the key read the plain fields, so the release that adds the key reaches them the old, unsigned way; signing can't secure that one step after the fact. From then on they only accept signed manifests.

When you don't want keyless installs to update any more, add `--signed-only` (to `publish` or `--sign-manifest`). The manifest is then just `{ "signed": { … } }`, and apps without a key see no update. A signed-only manifest stays signed-only when re-signed.

### turning signing off {#turning-off}

Installed apps with a key only accept signed manifests, even after you remove `publicKey` from tinyjs.json. The release that removes it has to reach them signed: publish it without the key, then put `publicKey` back in tinyjs.json long enough to run `tinyjs publish --sign-manifest dist/publish/manifest.json`.

## rotating or replacing a key {#rotation}

The update url stays the same throughout; only the key list changes. `publish` signs with whichever private key the variable names, as long as tinyjs.json lists its public key.

| situation | what to do |
|---|---|
| planned rotation | ship a release listing old, new and backup keys, still signed with the old one. Once most users have it, sign with the new key and drop the old one in a later release |
| signing key lost | sign with the backup. Ship a release listing the backup plus a newly generated key (your new backup), and keep signing with the backup |
| signing key leaked | the same, as fast as you can. Until users install the release that drops the leaked key, whoever has it can sign updates their apps accept. There's no revocation |
| every private key lost | signed apps can't be updated any more. Users have to reinstall from somewhere else they trust |

## errors {#errors}

From the app's `check()` and `install()`:

| message | |
|---|---|
| `signed Ed25519 update manifest required` | the manifest is unsigned, or its `signed` block is malformed |
| `update manifest signature verification failed` | signed with a key the app doesn't pin, or changed since |
| `invalid update signature …` / `invalid update publicKey …` | not valid base64, or the wrong length |
| `invalid signed update manifest` | the payload has no `version` |
| `update manifest expired … — the publisher needs to re-sign it` | see [expiry](#expires) |
| `update manifest has an invalid expires date` | `expires` isn't a date |
| `no newer signed update available for this platform` | `install()` with nothing newer for this OS and CPU |

From `tinyjs publish`:

| message | |
|---|---|
| `signed updates require TINYJS_UPDATE_PRIVATE_KEY_FILE …` | `publicKey` is set, the variable isn't |
| `set update.publicKey before using TINYJS_UPDATE_PRIVATE_KEY_FILE` | the reverse |
| `cannot sign updates: update manifest signature verification failed` | the private key doesn't match any listed public key |
| `--expires needs signed updates …`, `--signed-only needs signed updates …` | those flags without a key |
| `cannot sign manifest: … has edits outside its signed block …` | see [several platforms](#platforms) |

## what it protects against {#threat-model}

**It protects against** anyone who can change files on your update host, its storage or its CDN, or intercept the connection to it. They can't change the version, the notes, any download url or any sha256, so they can't get a different archive installed. That matters most on Windows and Linux, where tinyjs doesn't check the executables' own signatures, and for ad-hoc signed Mac apps, which have no Team ID to pin.

**It doesn't protect against:**

- **a leaked private key.** Whoever has it can sign updates until your apps stop trusting it (see [rotation](#rotation)).
- **your build machine or CI.** Whatever it builds, `publish` signs.
- **holding updates back.** The host can serve nothing, or an older signed manifest. Apps never install a version older than their own, but without [`--expires`](#expires) a host can keep offering an old signed release to users older than it.
- **the release that turns signing on**, which reaches existing installs unsigned ([above](#existing-installs)).
- **first installs.** The copy users download from your website isn't covered by this; that's Apple's and Microsoft's code signing.
- **the user's own machine.** The keys are in the installed app, and anyone who can modify it can change them.
