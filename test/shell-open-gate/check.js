// tjs run test/shell-open-gate/check.js — headless: which (origin, target)
// pairs shell.open lets through. A page the app didn't ship gets web and mail
// links only; the app's own pages keep everything.
import { shellOpenAllowed } from '../../runtime/bridge.js';

const own = new Set(['file://', 'http://127.0.0.1:5173']);   // as createApp builds it in devUrl mode
const cases = [
  // [origin, target, allowed]
  [undefined, '/Applications/Calculator.app', true],          // no stamp: older launcher
  ['file://', '/Users/me/Downloads/setup.exe', true],          // the app's own page
  ['file://', 'file:///etc/hosts', true],
  ['http://127.0.0.1:5173', 'vscode://file/x', true],          // dev server = own
  ['https://app.example.com', 'https://example.com/help', true],
  ['https://app.example.com', 'HTTP://example.com', true],
  ['https://app.example.com', 'mailto:a@example.com', true],
  ['https://app.example.com', '  https://example.com', true],
  ['https://app.example.com', '/Users/me/Downloads/setup.exe', false],
  ['https://app.example.com', 'C:\\Users\\me\\Downloads\\setup.exe', false],
  ['https://app.example.com', 'file:///Users/me/Downloads/run.command', false],
  ['https://app.example.com', 'ms-msdt:/id PCWDiagnostic', false],
  ['https://app.example.com', 'search-ms:query=x', false],
  ['https://app.example.com', 'javascript:alert(1)', false],
  ['https://app.example.com', '', false],
  ['https://app.example.com', null, false],
  ['http://127.0.0.1:9999', '/bin/sh', false],                 // a different local port is not own
  ['null', '/bin/sh', false],                                  // about:blank / data: frames
  ['https://file://.evil.com', '/bin/sh', false],
];
let fail = 0;
for (const [origin, target, want] of cases) {
  const got = shellOpenAllowed(target, origin, own);
  if (got !== want) { fail++; console.log('FAIL', JSON.stringify({ origin, target, want, got })); }
}
console.log(fail ? `${fail} FAILED` : `PASS ${cases.length} cases`);
tjs.exit(fail ? 1 : 0);
