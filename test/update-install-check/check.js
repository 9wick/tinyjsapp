// install() only installs what check() calls an update for THIS platform.
// Headless, any OS:   bin/tjs run test/update-install-check/check.js
//
// Unsigned installs used to take checkForUpdate's manifest whether or not an
// update was found — and when there was no entry for this OS/CPU, or nothing
// newer, that manifest still carried the top-level url: an Intel Mac would
// install an arm64-only build, a Windows arm64 app the mac zip.
//
// Outside a built app install() stops at "auto-update only works …" — so a
// case that reaches THAT message got past the availability check, and one
// that stops at "no newer update available …" didn't.
const { installUpdate } = await import(tjs.env.UPDATE_JS || '../../runtime/update.js');

const zip = { url: 'https://example.invalid/app.zip', sha256: 'a'.repeat(64) };
const manifests = {
  // a release with no build for ANY platform's own arch: every OS answers
  // available:false, but the top-level url is still there
  'no-entry': { version: '2.0.0', ...zip, mac: {}, win: {}, linux: {} },
  // nothing newer than the running version
  'not-newer': { version: '1.0.0', ...zip },
  // a real update, with a build for every platform and CPU
  'newer': { version: '2.0.0', ...zip,
             mac: { arm64: zip, x86_64: zip },
             win: { ...zip, arm64: zip, x86_64: zip },
             linux: { arm64: zip, x86_64: zip } },
};
const server = tjs.serve({
  port: 0,
  fetch: (req) => {
    const name = new URL(req.url).pathname.slice(1);
    return manifests[name]
      ? new Response(JSON.stringify(manifests[name]), { headers: { 'content-type': 'application/json' } })
      : new Response('nope', { status: 404 });
  },
});
const base = `http://127.0.0.1:${server.port}/`;

const cases = [
  ['no-entry', /no newer update available for this platform/],
  ['not-newer', /no newer update available for this platform/],
  ['newer', /auto-update only works/],   // passed the check
];
let fail = 0;
for (const [name, want] of cases) {
  let msg;
  try { await installUpdate({ url: base + name, version: '1.0.0' }); msg = 'INSTALLED'; }
  catch (e) { msg = String(e?.message ?? e); }
  const ok = want.test(msg);
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(10), msg);
}
server.close?.();
console.log(fail ? `${fail} FAILED` : `PASS ${cases.length} cases`);
tjs.exit(fail ? 1 : 0);
