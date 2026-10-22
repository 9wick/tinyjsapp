// Update fetches check EVERY redirect hop, not just where they end.
// Headless, any OS:   bin/tjs run test/update-redirects/check.js
//
// Only where a redirect chain ended used to be checked, so https → http →
// https passed: a network attacker on the plain-http hop could serve their
// own manifest. A hop to plain http (other than localhost) is now refused
// before it's requested. (http://127.0.0.1 / localhost are allowed for local
// testing, which is what lets this test run without TLS.)
const { checkForUpdate } = await import(tjs.env.UPDATE_JS || '../../runtime/update.js');

const manifest = { version: '9.9.9', url: 'https://example.invalid/a.zip', sha256: 'a'.repeat(64) };
const server = tjs.serve({
  port: 0,
  fetch: (req) => {
    const path = new URL(req.url).pathname;
    const go = (to) => new Response(null, { status: 302, headers: { location: to } });
    if (path === '/manifest.json') return Response.json(manifest);
    if (path === '/local-hop') return go(`http://localhost:${server.port}/manifest.json`);
    if (path === '/to-plain-http') return go('http://example.invalid/manifest.json');
    if (path === '/two-hops') return go(`http://127.0.0.1:${server.port}/to-plain-http`);
    return new Response('nope', { status: 404 });
  },
});
const base = `http://127.0.0.1:${server.port}`;

const cases = [
  ['/manifest.json', /^ok 9\.9\.9$/],
  ['/local-hop', /^ok 9\.9\.9$/],                                           // allowed hop still works
  ['/to-plain-http', /update url \(after redirect\) must be https:\/\/ \(got http:\/\/example\.invalid/],
  ['/two-hops', /update url \(after redirect\) must be https:\/\/ \(got http:\/\/example\.invalid/],
];
let fail = 0;
for (const [path, want] of cases) {
  let msg;
  try { const r = await checkForUpdate({ url: base + path, version: '1.0.0' }); msg = 'ok ' + r.latest; }
  catch (e) { msg = String(e?.message ?? e); }
  const ok = want.test(msg);
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', path.padEnd(16), msg);
}
server.close?.();
console.log(fail ? `${fail} FAILED` : `PASS ${cases.length} cases`);
tjs.exit(fail ? 1 : 0);
