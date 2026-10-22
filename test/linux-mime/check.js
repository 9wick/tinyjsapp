// Linux file associations join the type the system already has for an
// extension, instead of inventing application/x-<id>-<ext> with the same
// glob. Headless, any OS (it only reads fake shared-mime-info files):
//   bin/tjs run test/linux-mime/check.js
const { systemMimeForExt } = await import(tjs.env.BRIDGE_JS || '../../runtime/bridge.js');
const enc = new TextEncoder();
const root = await tjs.makeTempDir(tjs.tmpDir + '/tinyjs-mime-XXXXXX');
async function db(dir, lines) {
  await tjs.makeDir(`${root}/${dir}/mime`, { recursive: true });
  await tjs.writeFile(`${root}/${dir}/mime/globs2`, enc.encode('# globs2\n' + lines.join('\n') + '\n'));
  return `${root}/${dir}`;
}
const user = await db('user', [
  '50:application/x-com.example.notes-md:*.md',    // left by an older tinyjs: ignored
  '50:application/x-org.other.app-md:*.md',        // ANOTHER app's leftover: ignored too
  '50:application/x-org.other.app-zzqx:*.zzqx',    // another app's own type: not joined
  '60:text/x-user-thing:*.thing',
]);
const sys = await db('sys', [
  '50:text/markdown:*.md',
  '40:text/x-markdown:*.md',                       // lower weight loses
  '50:text/x-c:*.C:cs',                            // case-sensitive
  '50:text/x-csrc:*.c',
  '50:image/png:*.png',
  '50:text/x-user-thing-system:*.thing',
]);
const dirs = [user, sys, `${root}/missing`];
const skip = 'application/x-com.example.notes-';
const cases = [
  ['md', 'text/markdown'],
  ['.md', 'text/markdown'],          // a leading dot is fine
  ['MD', 'text/markdown'],           // case-folded glob
  ['C', 'text/x-c'],                 // the case-sensitive one wins for .C
  ['c', 'text/x-csrc'],
  ['thing', 'text/x-user-thing'],    // user db, higher weight
  ['notes', null],                   // nothing claims it: the app gets its own
  ['zzqx', null],                    // only another tinyjs app does: still its own
];
let fail = 0;
for (const [ext, want] of cases) {
  const got = await systemMimeForExt(ext, dirs, skip);
  if (got !== want) { fail++; console.log('FAIL', ext, 'want', want, 'got', got); }
}
await tjs.spawn(['rm', '-rf', root]).wait();
console.log(fail ? `${fail} FAILED` : `PASS ${cases.length} cases`);
tjs.exit(fail ? 1 : 0);
