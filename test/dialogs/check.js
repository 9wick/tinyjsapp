// Real bridge + pipe transport; only the native UI peer is simulated.
// Run from the repo root: bin/tjs run test/dialogs/check.js
import { createApp } from '../../runtime/bridge.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
await tjs.makeDir(tjs.cwd + '/.tmp', { recursive: true });
const dir = await tjs.makeTempDir(tjs.cwd + '/.tmp/dialogs-XXXXXX');
const path = tjs.env.OS === 'Windows_NT' ? '\\\\.\\pipe\\' + dir.split(/[\\/]/).pop() : dir + '/app.sock';
const listener = await tjs.listen('pipe', path);
const accept = (await listener.opened).readable.getReader();
const oldSocket = tjs.env.TINYJS_SOCKET;
tjs.env.TINYJS_SOCKET = path;
const timeout = setTimeout(() => { console.log('FAIL dialog test timed out'); tjs.exit(1); }, 10000);
const appPromise = createApp({ mainWindow: false, apiAccess: { origins: { 'https://allowed.test': ['dialog.*', 'win.printToPDF'] } },
  onTray: async (_id, app) => { trayResult = await app.dialog.confirm('From tray'); } });
const { value: conn } = await accept.read();
const { readable, writable } = await conn.opened;
const reader = readable.getReader(), writer = writable.getWriter();
const lines = [], waiters = [];
let trayResult, buffer = '';
const readDone = (async () => {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += dec.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
      if (/^(DLG|RET|PDF) /.test(line)) {
        if (waiters.length) waiters.shift()(line); else lines.push(line);
      }
    }
  }
})();
const next = () => lines.length ? Promise.resolve(lines.shift()) : new Promise(r => waiters.push(r));
const send = (line) => writer.write(enc.encode(line + '\n'));
const call = (id, method, params, origin) => send('CALL ' + id + ' ' +
  JSON.stringify([JSON.stringify({ method, params }), origin]));

try {
  const app = await appPromise;
  const exchange = async (start, body, answer) => {
    const pending = start();
    const line = await next();
    const m = /^DLG q(\d+) (.*)$/.exec(line);
    assert(m && m[2] === body, 'unexpected panel: ' + line);
    await send(`GOT ${m[1]} ${JSON.stringify(answer)}`);
    assert(same(await pending, answer), 'wrong result for ' + body);
  };
  for (const [method, body] of [['openFile', 'open\t'], ['openFiles', 'openmulti\t'],
      ['pickFolder', 'dir'], ['saveFile', 'save\t\t']])
    await exchange(() => app.dialog[method](), body, null);
  await exchange(() => app.dialog.openFile({ types: ['.JSON', '../bad', 'txt'] }), 'open\tjson,txt', '/chosen.json');
  await exchange(() => app.dialog.openFiles({ types: ['json'] }), 'openmulti\tjson', ['/one.json', '/two.json']);
  await exchange(() => app.dialog.pickFolder(), 'dir', '/folder');
  await exchange(() => app.dialog.saveFile({ types: ['json'], name: '../folder/report.json' }), 'save\tjson\treport.json', '/report.json');
  await exchange(() => app.dialog.alert('Done', 'First\nSecond'), 'alert\tDone\tFirst\\nSecond\t', true);
  for (const answer of [true, false])
    await exchange(() => app.dialog.confirm('Continue?', { detail: 'Details', ok: 'Go', cancel: 'Stop' }), 'confirm\tContinue?\tDetails\tGo\tStop', answer);
  await exchange(() => app.dialog.confirm('Continue?', 'Details'), 'confirm\tContinue?\tDetails\t\t', true);
  for (const answer of ['', 'value', null])
    await exchange(() => app.dialog.prompt('Name', { default: 'value', ok: 'Save', cancel: 'Stop' }), 'prompt\tName\tvalue\tSave\tStop', answer);
  for (const method of ['alert', 'confirm', 'prompt']) {
    for (const opts of [[], 42, false, ...(method === 'prompt' ? ['invalid'] : [])]) {
      let error;
      try { await app.dialog[method]('Message', opts); } catch (e) { error = e; }
      assert(error instanceof TypeError, method + ' must reject invalid options');
    }
  }
  console.log('PASS seven methods, normalization, cancellation, invalid options');

  // Simultaneous requests must settle by id, even if answers arrive backwards.
  const first = app.dialog.confirm('First');
  const firstId = (await next()).split(' ')[1].slice(1);
  const second = app.dialog.prompt('Second');
  const secondId = (await next()).split(' ')[1].slice(1);
  assert(firstId !== secondId, 'request ids must be unique');
  await send(`GOT ${secondId} "second"`);
  await send(`GOT ${firstId} false`);
  assert(same(await Promise.all([first, second]), [false, 'second']), 'crossed dialog replies');
  await send('TRAY export');
  const trayId = (await next()).split(' ')[1].slice(1);
  await send(`GOT ${trayId} true`);
  // The next CALL/RET is a barrier through the same read loop.
  await call('main:1', 'dialog.confirm', { message: 'Denied' }, 'https://denied.test');
  assert((await next()).startsWith('RET main:1 1 '), 'denied page reached native UI');
  assert(trayResult === true, 'async tray handler did not resume');
  await call('main:2', 'dialog.confirm', { message: 'Allowed' }, 'https://allowed.test');
  assert(await next() === 'DLG main:2 confirm\tAllowed\t\t\t', 'allowed page protocol changed');
  console.log('PASS out-of-order replies, async tray hook, origin gate');

  await call('main:3', 'win.printToPDF', { path: '/outside/report.pdf' }, 'https://denied.test');
  assert((await next()).startsWith('RET main:3 1 '), 'PDF must retain the page gate');
  await call('main:4', 'win.printToPDF', { path: '/outside/report.pdf' }, 'https://allowed.test');
  const pdfLine = await next();
  const pdf = /^DLG q(\d+) save\tpdf\treport.pdf\tdownloads$/.exec(pdfLine);
  assert(pdf, 'PDF consent must retain Downloads: ' + pdfLine);
  await send(`GOT ${pdf[1]} null`);
  assert((await next()).startsWith('RET main:4 1 '), 'PDF cancellation must reject');
  console.log('PASS PDF consent folder and cancellation');
  await writer.close();
  await app.done;
  await reader.cancel();
  await readDone;
} finally {
  if (oldSocket === undefined) delete tjs.env.TINYJS_SOCKET; else tjs.env.TINYJS_SOCKET = oldSocket;
  clearTimeout(timeout);
  await accept.cancel();
  await tjs.remove(dir, { recursive: true });
}
console.log('PASS dialogs');
tjs.exit(0);
