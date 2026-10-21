# Signed app updates (opt in)

`update.publicKey` pins one or more Ed25519 publisher keys in the compiled
backend.
The runtime authenticates the entire manifest before selecting a platform or
reading release notes, then retains the existing transport, archive SHA-256,
macOS code-signature/Team ID checks and rollback behavior. The signature is
independent of Apple/Windows executable signing. This protects against a
compromised update host when the signing key remains private.

Signing is on only when `update.publicKey` is a non-empty string or a
non-empty list of strings. Apps without one (the key absent, `null`, `""`,
`[]` or any other type) keep the existing unsigned manifest behavior, and
`tinyjs publish` notes it when the key is set but unusable. A key that is not
valid base64 of 32 bytes (any entry of a list, even beside a good one), a
missing signature, unsupported envelope or incorrect signature fails closed. An engine
without Ed25519 support also fails closed; there is no unsigned fallback.

## Create two keys and keep them outside the app project

Start with two keys: one you sign with, and a backup kept offline (a
password manager, an encrypted USB stick: somewhere apart from the first).
Apps accept a manifest signed by either. If the signing key is lost or
leaks, the backup can still ship updates to every installed app, including
the release that drops the bad key. A key only helps once it's baked into
installed apps, so pin the backup from your first signed release.

Use WebCrypto in the same bundled `bin/tjs` runtime used by the publisher.
This example writes, for each key, a PKCS8 **DER** private key and a
raw-public-key base64 file in an existing private directory. Run it outside
your app project; restrict access to that directory first (for example
`umask 077` on macOS/Linux).

```js
// save as keygen.js in the private directory; run: /path/to/bin/tjs run keygen.js
for (const name of ['update', 'update-backup']) {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  await tjs.writeFile(name + '-private.der',
    new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const publicKey = btoa(Array.from(raw, b => String.fromCharCode(b)).join(''));
  await tjs.writeFile(name + '-public.txt', new TextEncoder().encode(publicKey));
}
```

Put only the public files' contents into `tinyjs.json`, as a list (a single
string also works, for one key):

```json
{
  "update": {
    "url": "https://example.com/updates/signed-manifest.json",
    "publicKey": ["BASE64_OF_SIGNING_PUBLIC_KEY", "BASE64_OF_BACKUP_PUBLIC_KEY"]
  }
}
```

Move `update-backup-private.der` to its offline home now; day to day only
`update-private.der` is used. `publish` signs with whichever private key
`TINYJS_UPDATE_PRIVATE_KEY_FILE` names, and refuses one that matches none of
the listed public keys.

Never put a private key in `tinyjs.json`, source/resource folders, version
control or an uploaded release. The publisher reads it only from an explicitly
provided file path; no secret is added to generated app configuration. Keep
that file outside the project: tinyjs copies backend sources when building.
Use a secret file provisioned by your CI secret store when publishing in CI.

```sh
TINYJS_UPDATE_PRIVATE_KEY_FILE=/private/path/update-private.der tinyjs publish --notes "Release notes"
```

In PowerShell, set `$env:TINYJS_UPDATE_PRIVATE_KEY_FILE` to the external file
path, then run `tinyjs publish`. The variable names a file, not the secret
itself. A configured public key requires a matching private key before the
build touches `dist/`. Supplying the variable without `update.publicKey` is an
error. Ordinary `tinyjs build` and `tinyjs dev` need no private key.

Upload the archive and generated `dist/publish/manifest.json`. The configured
URL may use a different filename, such as `signed-manifest.json`; upload the
manifest under that name. All download URLs must remain HTTPS (localhost HTTP
is allowed for testing).

## Exact signed format

The hosted manifest is the ordinary one with a `signed` block added:

```json
{
  "version": "2.0.0",
  "url": "https://example.com/App.zip",
  "sha256": "...",
  "notes": "...",
  "signed": {
    "format": "tinyjs-update-v1",
    "algorithm": "Ed25519",
    "payload": "{\"version\":\"2.0.0\",\"url\":\"https://example.com/App.zip\",\"sha256\":\"...\",\"notes\":\"...\"}",
    "signature": "BASE64_OF_64_SIGNATURE_BYTES"
  }
}
```

Apps **without** a key read the plain fields, exactly as they always have,
and ignore `signed`. Apps **with** a key read only `signed` and ignore
everything else: a missing or broken block means no update. `publish` writes
both halves from the same data, so editing the plain fields by hand changes
what keyless apps see and nothing else.

The signed bytes are UTF-8 encoding of `"tinyjs-update-v1\n" + payload`.
`payload` is the complete plain JSON manifest as a string: version, notes,
URLs, hashes and every platform/architecture block are authenticated together.
There is no JSON canonicalization step during verification: changing even
whitespace inside the payload invalidates the signature. The `signed` block
holds exactly these four fields; whitespace and field order around them are
irrelevant. Base64 must be standard canonical base64 with padding; a raw key
is 32 bytes and a signature is 64 bytes. The server cannot provide or replace
the trusted public key.

`--signed-only` (on `publish` or `--sign-manifest`) writes just
`{ "signed": { … } }`: apps without a key then see no update at all. Use it
once you want older installs cut off from the unsigned path.

`check()` verifies before platform overlays. `install()` fetches and verifies
again using the baked key, even if a caller supplies a previous check result
or a fabricated manifest. It refuses an older/current version or an update
missing this platform. A changed, correctly signed newer release between
check and install can therefore be installed. The existing unsigned API
behavior remains unchanged for apps with no pinned key.

## Optional expiry

By default a signed manifest stays valid forever. Someone who controls the
update host can't forge one, but they can keep serving an old one: holding
users on an earlier release, or offering a superseded release to users older
than it. `--expires` limits that window by putting an expiry inside the
signed payload:

```sh
TINYJS_UPDATE_PRIVATE_KEY_FILE=… tinyjs publish --expires 30d        # or a date: 2027-01-31
TINYJS_UPDATE_PRIVATE_KEY_FILE=… tinyjs publish --sign-manifest manifest.json --expires 30d
```

After that moment, `check()` and `install()` refuse the manifest with
`update manifest expired …`, and automatic checks stay silent. The cost:
you must re-sign before it runs out, or every installed app stops seeing
updates until you do. `--sign-manifest` accepts an already-signed manifest,
verifies it against the pinned key, and re-signs it with the new date, so
extending is one command (a cron job in CI works). A user whose clock is
wrong by more than the remaining window gets refused too, so keep the
window generous. Unsigned apps ignore the field, since anyone who could
edit their manifest could edit the date.

## Several platforms or architectures

Consecutive macOS `publish --arch arm64` / `publish --arch x86_64` operations
verify the previous signed manifest, merge the arch entries for the same
version, and sign the whole result again. An invalid prior manifest is not
trusted or merged; publish that architecture again if it must be included.

For independent platform builds, merge the plain fields as before: macOS
owns top-level `url`/`sha256` and `mac`, Windows owns `win`, and Linux owns
per-architecture `linux` entries. **Delete the `signed` blocks** from what
you merged, review the final version, notes and every URL/hash, then sign
after the final merge:

```sh
TINYJS_UPDATE_PRIVATE_KEY_FILE=/private/path/update-private.der tinyjs publish --sign-manifest /release/merged-manifest.json
```

Run from the app project containing the pinned public key. This command does
not build; it adds the `signed` block only after a successful
signature/matching-key check. Given a file that already has a `signed` block,
it verifies it and re-signs the same data (to extend `--expires`, say), and a
signed-only file stays signed-only. If the plain fields beside the block
differ from it (a merge that kept one platform's block), it refuses rather
than guess which you meant.

## Migrating existing apps

Nothing to migrate. Keep the same `update.url`, add `publicKey`, and publish
as usual. Installs from before the key keep updating through the plain
fields; the release that adds the key reaches them that way (the old trust
model, which enabling signing can't make retroactively secure), and from
then on they only accept signed updates. When you no longer want keyless
installs updating at all, publish with `--signed-only`.

## Rotating or replacing a key

The update URL stays the same throughout; only the key list changes.

- **Planned rotation:** generate a new key and ship a release whose
  `publicKey` lists old, new and backup, still signed with the old key. Once
  most users have it, sign with the new key and drop the old one from the
  list in a later release.
- **Signing key lost:** sign with the backup. Ship a release listing the
  backup plus a freshly generated key (your new backup), and carry on
  signing with the backup.
- **Signing key leaked:** the same, as fast as you can. Until users install
  the release that drops the leaked key, whoever has it can sign updates
  those apps will accept, so the race matters. There is no revocation
  service.

If every listed private key is lost, signed apps can't be updated anymore;
users have to reinstall from another trusted channel. Unless you use
`--expires`, there is also no protection from replay of a previously signed
version newer than the current installed version.

## Verification

```sh
./bin/tjs run test/signed-updates/crypto-probe.js
./bin/tjs run test/signed-updates/runtime-check.js
python3 -u test/signed-updates/check.py
```

The first two exercise RFC 8032, actual WebCrypto imports and adversarial
verification in bundled txiki. The Python runner also checks publisher key
failure before build, signing a merged manifest, and CLI `new`/`version`.
On macOS with the launcher built it publishes a real archive, launches a
packaged old app, rejects tampering and a check/install substitution, retains
checksum validation, installs and relaunches the new version, and repeats
the installation with a legacy unsigned app. The integration fixture uses
only localhost and temporary directories/keys. Packaged Windows and Linux
installations require separate verification on those systems; the script
explicitly skips that portion there.
