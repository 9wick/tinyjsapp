import { base64, signManifest, verifyManifest } from '../../runtime/update-signing.js';
import { checkForUpdate, installUpdate } from '../../runtime/update.js';
const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const key = base64(await crypto.subtle.exportKey('raw', pair.publicKey));
const wrong = base64(await crypto.subtle.exportKey('raw', other.publicKey));
const copy = x => JSON.parse(JSON.stringify(x));
let passed = 0;
function assert(ok, what) { if (!ok) throw new Error(what); passed++; }
async function rejects(fn, what, match) {
  try { await fn(); } catch (e) {
    assert(!match || String(e).includes(match), what + ': unexpected error ' + e);
    return;
  }
  throw new Error('accepted ' + what);
}
const payload = { version: '2.0.0', notes: 'release — привет', url: 'https://host/mac.zip', sha256: 'a'.repeat(64),
  mac: { arm64: { url: 'https://host/a.zip', sha256: 'b'.repeat(64) }, x86_64: { url: 'https://host/x.zip', sha256: 'c'.repeat(64) } },
  win: { version: '2.0.1', notes: 'win notes', url: 'https://host/w.zip', sha256: 'd'.repeat(64) },
  linux: { notes: 'linux notes', arm64: { url: 'https://host/l-a.tar.gz', sha256: 'e'.repeat(64) }, x86_64: { url: 'https://host/l-x.tar.gz', sha256: 'f'.repeat(64) } } };
const signed = await signManifest(payload, pair.privateKey, key);
// Patch the envelope inside the hosted document's "signed" block.
const withSigned = (patch) => ({ ...signed, signed: { ...signed.signed, ...patch } });
assert(JSON.stringify(await verifyManifest(signed, key)) === JSON.stringify(payload), 'round trip');
const { signed: _block, ...plainFields } = signed;
assert(JSON.stringify(plainFields) === JSON.stringify(payload), 'plain fields mirror the payload for keyless apps');
await rejects(() => verifyManifest(signed, wrong), 'wrong pin');
const badSig = Uint8Array.from(atob(signed.signed.signature), c => c.charCodeAt(0));
badSig[0] ^= 1;
await rejects(() => verifyManifest(withSigned({ signature: base64(badSig) }), key), 'tampered signature');
await rejects(() => signManifest(payload, other.privateKey, key), 'publisher mismatched key');
for (const field of ['version', 'notes', 'url', 'sha256', 'mac.arm64.url', 'mac.x86_64.sha256',
  'win.version', 'win.notes', 'win.url', 'win.sha256', 'linux.notes', 'linux.arm64.sha256', 'linux.x86_64.url']) {
  const m = copy(payload), path = field.split('.'), last = path.pop();
  let at = m; for (const p of path) at = at[p]; at[last] += '-tampered';
  await rejects(() => verifyManifest(withSigned({ payload: JSON.stringify(m) }), key), field);
}
for (const value of [null, '', wrong + '\n', '!!!!', base64(new Uint8Array(31))])
  await rejects(() => verifyManifest(signed, value), 'malformed pin');
for (const env of [payload, withSigned({ algorithm: 'none' }), withSigned({ format: 'v2' }),
  withSigned({ signature: 'AA==' }), withSigned({ signature: signed.signed.signature.slice(0, -1) + '!' }),
  withSigned({ url: 'https://host/evil' }), withSigned({ payload: '{' }),
  { ...payload, signed: null }, { ...payload, signed: 'x' }, { ...payload, signed: [] }, signed.signed])
  await rejects(() => verifyManifest(env, key), 'invalid envelope');
// Plain fields are for keyless apps only: rewriting them changes nothing
// for an app with a key.
const rewritten = await verifyManifest({ ...signed, version: '9.9.9', url: 'https://host/evil', sha256: '0'.repeat(64) }, key);
assert(rewritten.version === '2.0.0' && rewritten.url === payload.url && rewritten.sha256 === payload.sha256, 'plain fields ignored with a key');
// Signing drops an old "signed" block rather than signing over it.
const resigned = await signManifest(signed, pair.privateKey, key);
assert(!('signed' in await verifyManifest(resigned, key)), 'no nested signed block');
// --signed-only: just the block; keyless apps see no update.
const only = await signManifest(payload, pair.privateKey, key, { signedOnly: true });
assert(Object.keys(only).join() === 'signed', 'signed-only shape');
assert((await verifyManifest(only, key)).version === '2.0.0', 'signed-only verifies');
const envelope = copy(signed);
const verifying = verifyManifest(envelope, key);
envelope.signed.payload = '{}'; envelope.signed.signature = ''; envelope.signed = null;
assert((await verifying).version === '2.0.0', 'snapshot across crypto await');
let response = signed, requests = [];
globalThis.fetch = async url => {
  requests.push(url);
  return { ok: true, url, json: async () => copy(response) };
};
const opts = { url: 'https://host/manifest.json', version: '1.0.0', publicKey: key };
const checked = await checkForUpdate(opts);
assert(checked.available && checked.latest.startsWith('2.'), 'signed check');
checked.manifest.url = 'https://host/evil';
response = payload;
await rejects(() => installUpdate({ ...opts, manifest: checked.manifest }), 'check/install unsigned substitution', 'signed Ed25519');
assert(requests.every(url => url === opts.url), 'no download before authentication');
response = withSigned({ payload: JSON.stringify({ ...payload, notes: 'evil' }) });
await rejects(() => installUpdate({ ...opts, manifest: payload }), 'direct install tamper', 'signature verification failed');
assert(requests.every(url => url === opts.url), 'no effects from supplied manifest');
const old = await signManifest({ ...payload, version: '0.1.0', win: undefined, mac: undefined, linux: undefined }, pair.privateKey, key);
response = old;
await rejects(() => installUpdate(opts), 'old signed version', 'no newer signed update');
// Pin cannot be substituted by mutating caller options during fetch.
response = await signManifest(payload, other.privateKey, wrong);
const changing = { ...opts };
const pending = checkForUpdate(changing); changing.publicKey = wrong;
await rejects(() => pending, 'pin substitution across fetch', 'signature verification failed');
response = payload;
assert((await checkForUpdate({ url: opts.url, version: opts.version })).available, 'legacy unsigned check');
// One url for both: a keyless app reads the plain fields of a signed manifest,
// and sees nothing in a signed-only one.
response = signed;
const keyless = await checkForUpdate({ url: opts.url, version: opts.version });
assert(keyless.available && keyless.manifest.signed, 'keyless app reads a signed manifest');
response = only;
assert(!(await checkForUpdate({ url: opts.url, version: opts.version })).available, 'keyless app ignores signed-only');
response = payload;
// Optional signed expiry: future passes, past/invalid fail, unsigned ignores.
const day = 86400000;
response = await signManifest({ ...payload, expires: new Date(Date.now() + day).toISOString() }, pair.privateKey, key);
assert((await checkForUpdate(opts)).available, 'unexpired signed manifest');
response = await signManifest({ ...payload, expires: new Date(Date.now() - day).toISOString() }, pair.privateKey, key);
await rejects(() => checkForUpdate(opts), 'expired signed manifest', 'expired');
await rejects(() => installUpdate(opts), 'expired signed install', 'expired');
for (const bad of ['soon', 12345, ''])
  await rejects(async () => { response = await signManifest({ ...payload, expires: bad }, pair.privateKey, key); await checkForUpdate(opts); }, 'invalid expires', 'invalid expires');
response = { ...payload, expires: new Date(Date.now() - day).toISOString() };
assert((await checkForUpdate({ url: opts.url, version: opts.version })).available, 'unsigned ignores expires');
response = payload;
// Several pinned keys (backup / rotation): a signature from any one passes,
// in any position; one malformed entry fails closed even beside a good key.
const third = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const thirdKey = base64(await crypto.subtle.exportKey('raw', third.publicKey));
response = signed;
assert((await checkForUpdate({ ...opts, publicKey: [key, wrong] })).available, 'first of two keys');
assert((await checkForUpdate({ ...opts, publicKey: [wrong, key] })).available, 'second of two keys');
response = await signManifest(payload, other.privateKey, [key, wrong]);
assert((await checkForUpdate({ ...opts, publicKey: [key, wrong] })).available, 'signed by the backup key');
await rejects(() => checkForUpdate({ ...opts, publicKey: [key, thirdKey] }), 'signer not in list', 'signature verification failed');
await rejects(() => checkForUpdate({ ...opts, publicKey: [wrong, '!!!!'] }), 'malformed entry beside a good key', 'publicKey');
await rejects(() => checkForUpdate({ ...opts, publicKey: [wrong, ''] }), 'empty entry beside a good key', 'publicKey');
await rejects(() => signManifest(payload, third.privateKey, [key, wrong]), 'publisher key in no listed slot');
const keys = [key, wrong];
const racing = checkForUpdate({ ...opts, publicKey: keys }); keys[1] = thirdKey;
assert((await racing).available, 'key list snapshot across fetch');
response = payload;
// Only a non-empty string (or list) pins a key: every other value means unsigned.
for (const value of [null, '', 0, false, {}, []])
  assert((await checkForUpdate({ ...opts, publicKey: value })).available, 'unsigned with publicKey ' + JSON.stringify(value));
// A non-empty but unusable string still fails closed.
response = signed;
for (const value of [' ', '!!!!', wrong + '\n'])
  await rejects(() => checkForUpdate({ ...opts, publicKey: value }), 'malformed non-empty pin', 'publicKey');
console.log('PASS ' + passed + ' signed-update adversarial assertions (actual txiki)');
