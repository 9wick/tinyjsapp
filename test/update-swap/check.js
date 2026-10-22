// The macOS/Linux update swap keeps the current app intact unless the new
// one is completely in place. Headless, macOS and Linux:
//   bin/tjs run test/update-swap/check.js
//
// swapBundle stages the new app beside the current one (copying when the
// rename can't cross filesystems), then swaps with two renames. It used to
// copy straight into the app's place after moving it aside, so a copy that
// failed partway left a half-copied app and stranded the real one.
if (tjs.env.OS === 'Windows_NT') { console.log('SKIP: Windows swaps file by file (winSwapDir)'); tjs.exit(0); }
const { swapBundle } = await import(tjs.env.UPDATE_JS || '../../runtime/update.js');

const enc = new TextEncoder(), dec = new TextDecoder();
const root = await tjs.makeTempDir(tjs.tmpDir + '/tinyjs-swap-XXXXXX');
const exists = (p) => tjs.lstat(p).then(() => true, () => false);
const read = async (p) => dec.decode(await tjs.readFile(p));
async function fixture(name) {
  const dir = `${root}/${name}`;
  await tjs.makeDir(`${dir}/app/sub`, { recursive: true });
  await tjs.writeFile(`${dir}/app/version.txt`, enc.encode('old'));
  await tjs.makeDir(`${dir}/new/bin`, { recursive: true });
  await tjs.makeDir(`${dir}/new/sub`, { recursive: true });
  await tjs.writeFile(`${dir}/new/version.txt`, enc.encode('new'));
  await tjs.writeFile(`${dir}/new/bin/run`, enc.encode('#!/bin/sh\n'));
  await tjs.chmod(`${dir}/new/bin/run`, 0o755);
  await tjs.symlink('version.txt', `${dir}/new/link`);
  return { app: `${dir}/app`, newApp: `${dir}/new` };
}
const noCrossFs = (from) => async (a, b) => {   // the rename EXDEV gives across mounts
  if (a === from) throw new Error('EXDEV');
  return tjs.rename(a, b);
};
const leftovers = async (app) => (await exists(app + '.update-new')) || (await exists(app + '.update-backup'));

let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, detail); };

{ // plain rename
  const f = await fixture('rename');
  await swapBundle(f.newApp, f.app);
  check('rename: new version in place', (await read(f.app + '/version.txt')) === 'new');
  check('rename: nothing left beside it', !(await leftovers(f.app)));
}
{ // across filesystems: copied, exec bit and symlink kept
  const f = await fixture('copy');
  await swapBundle(f.newApp, f.app, { rename: noCrossFs(f.newApp) });
  check('copy: new version in place', (await read(f.app + '/version.txt')) === 'new');
  check('copy: exec bit kept', ((await tjs.stat(f.app + '/bin/run')).mode & 0o111) !== 0);
  check('copy: symlink kept as a link', (await tjs.lstat(f.app + '/link')).isSymbolicLink);
  check('copy: nothing left beside it', !(await leftovers(f.app)));
}
{ // the copy fails partway: the current app must be untouched
  const f = await fixture('copyfail');
  await tjs.writeFile(f.newApp + '/sub/unreadable', enc.encode('x'));
  await tjs.chmod(f.newApp + '/sub/unreadable', 0o000);
  let msg = '';
  try { await swapBundle(f.newApp, f.app, { rename: noCrossFs(f.newApp) }); } catch (e) { msg = e.message; }
  await tjs.chmod(f.newApp + '/sub/unreadable', 0o644);
  check('copy fails: rejects', /current version is intact/.test(msg), msg);
  check('copy fails: current app untouched', (await read(f.app + '/version.txt')) === 'old');
  check('copy fails: nothing left beside it', !(await leftovers(f.app)));
}
{ // the final rename fails: the current app comes back
  const f = await fixture('lastrename');
  const staged = f.app + '.update-new';
  let msg = '';
  try {
    await swapBundle(f.newApp, f.app, { rename: async (a, b) => {
      if (a === staged) throw new Error('EBUSY');
      return tjs.rename(a, b);
    } });
  } catch (e) { msg = e.message; }
  check('last rename fails: rejects', /current version is intact/.test(msg), msg);
  check('last rename fails: current app back in place', (await read(f.app + '/version.txt')) === 'old');
  check('last rename fails: nothing left beside it', !(await leftovers(f.app)));
}
await new Promise((r) => tjs.spawn(['rm', '-rf', root]).wait().then(r));
console.log(fail ? `${fail} FAILED` : 'PASS all swap cases');
tjs.exit(fail ? 1 : 0);
