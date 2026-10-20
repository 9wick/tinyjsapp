// app.cookies probe (#46) — see ../../README.md. Runs once the login page has
// had time to set its cookies, writes results to $COOKIE_OUT (or prints
// them), points the window at /echo so server.py logs what rides the
// request, then quits.
const BASE = 'http://127.0.0.1:8799';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function init(app) {
  run(app).catch((e) => finish(app, { fatal: String(e?.stack ?? e) }));
}

async function run(app) {
  const out = {};
  const step = async (k, fn) => {
    try { out[k] = await fn(); } catch (e) { out[k] = 'THREW ' + (e?.message ?? e); }
  };
  await sleep(3000);
  await step('fromPage', async () => (await app.cookies.get({ url: BASE + '/' }))
    .map((c) => `${c.name}=${c.value} domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} sameSite=${c.sameSite} expires=${c.expires}`));
  await step('all', async () => (await app.cookies.get()).length);
  await step('set', () => app.cookies.set({ url: BASE, name: 'injected', value: 'v1',
    httpOnly: true, expires: Date.now() + 3600e3, sameSite: 'lax' }));
  await step('readBack', async () => (await app.cookies.get({ url: BASE + '/x', name: 'injected' }))
    .map((c) => ({ ...c, expiresInMin: Math.round((c.expires - Date.now()) / 60e3) })));
  await step('session', async () => {
    await app.cookies.set({ url: BASE, name: 'sess', value: 'a b=c' });
    return (await app.cookies.get({ url: BASE, name: 'sess' })).map((c) => [c.value, c.expires]);
  });
  await step('otherPath', async () => {
    await app.cookies.set({ url: BASE, name: 'deep', value: '1', path: '/admin' });
    return [(await app.cookies.get({ url: BASE + '/', name: 'deep' })).length,
            (await app.cookies.get({ url: BASE + '/admin/x', name: 'deep' })).length,
            (await app.cookies.get({ url: BASE + '/adminx', name: 'deep' })).length];
  });
  await step('badName', () => app.cookies.set({ url: BASE, name: 'a;b', value: '1' }));
  await step('badValue', () => app.cookies.set({ url: BASE, name: 'ok', value: 'x\r\nSet-Cookie: evil=1' }));
  await step('noWhere', () => app.cookies.set({ name: 'ok', value: '1' }));
  await step('removeVis', () => app.cookies.remove({ url: BASE, name: 'vis' }));
  await step('removeExact', async () => {
    const [d] = await app.cookies.get({ url: BASE + '/admin', name: 'deep' });
    return d ? app.cookies.remove(d) : 'deep missing';
  });
  await step('removeMissing', () => app.cookies.remove({ name: 'nope', domain: '127.0.0.1' }));
  await step('afterRemove', async () => (await app.cookies.get({ url: BASE })).map((c) => c.name).sort());
  // A backend-set cookie must ride the webview's next request (server.py
  // prints it). Expect sid, injected, sess — no vis, no deep.
  app.eval(`location.href = ${JSON.stringify(BASE + '/echo')}`);
  await sleep(2000);
  await step('clear', () => app.cookies.remove({ url: BASE }));
  await step('afterClear', async () => (await app.cookies.get({ url: BASE })).length);
  finish(app, out);
}

async function finish(app, out) {
  const json = JSON.stringify(out, null, 2);
  const path = tjs.env.COOKIE_OUT;
  if (path) await tjs.writeFile(path, new TextEncoder().encode(json));
  else console.log(json);
  app.quit();
}
