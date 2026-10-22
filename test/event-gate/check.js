// Page events and the "api" gate: which name each event is checked under,
// and the delivery script's own origin check. Headless, any OS:
//   bin/tjs run test/event-gate/check.js
// test/event-gate/README.md has the end-to-end run with a wrapped site.
const { eventGateName, eventScript, compileApiGate } =
  await import(tjs.env.BRIDGE_JS || '../../runtime/bridge.js');
let fail = 0;
const check = (name, ok, extra = '') => { if (!ok) fail++; if (!ok || tjs.env.VERBOSE) console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

// names: tinyjs's own events count as their calls; the rest are event.<name>
check('menu → menu.event', eventGateName('menu') === 'menu.event');
check('theme → theme.get', eventGateName('theme') === 'theme.get');
check('open-url is its own', eventGateName('open-url') === 'event.open-url');
check('drop is its own', eventGateName('drop') === 'event.drop');
check('custom app event', eventGateName('tick') === 'event.tick');

// what the wrapper preset lets a site hear
const wrap = compileApiGate({ disable: ['*'], enable: ['win.close'], origins: { 'https://s.com': 'wrapper' } });
const hears = (ev) => wrap(eventGateName(ev), 'https://s.com');
for (const ev of ['menu', 'contextmenu', 'tray', 'theme', 'locale', 'window-state', 'media-key', 'notification-click'])
  check(`wrapped site hears ${ev}`, hears(ev));
for (const ev of ['open-url', 'open-files', 'drop', 'download', 'navigate', 'popup', 'audio-tap', 'update-available', 'clipboard-change', 'hotkey', 'tick'])
  check(`wrapped site doesn't hear ${ev}`, !hears(ev));
const granted = compileApiGate({ origins: { 'https://s.com': { preset: 'wrapper', enable: ['event.tick', 'event.open-url'] } } });
check('granted event.tick', granted(eventGateName('tick'), 'https://s.com'));
check('granted event.open-url', granted(eventGateName('open-url'), 'https://s.com'));

// the delivery script, run against a fake page
function run(script, loc) {
  const got = [];
  const g = { location: loc, window: null };
  g.window = { __emit: (m) => got.push(m) };
  new Function('location', 'window', script)(g.location, g.window);
  return got;
}
const data = { secret: 'oauth-code-123' };
const site = eventScript('open-url', data, 'https://s.com');
check('same origin: delivered', run(site, { origin: 'https://s.com', protocol: 'https:' }).length === 1);
check('navigated away: dropped', run(site, { origin: 'https://evil.com', protocol: 'https:' }).length === 0);
check('dropped page never sees the data', !(() => {
  // a hostile page's own __emit, and a getter on location.origin that
  // records nothing useful — the data must not be built before the check
  const seen = [];
  const script = eventScript('open-url', data, 'https://s.com');
  new Function('location', 'window', script)({ origin: 'https://evil.com' }, { __emit: (m) => seen.push(m) });
  return seen.length;
})());
const own = eventScript('menu', { id: 'x' }, 'file://');
check('file:// page matched by protocol', run(own, { origin: 'null', protocol: 'file:' }).length === 1);
check('file:// origin, page now https: dropped', run(own, { origin: 'https://evil.com', protocol: 'https:' }).length === 0);
check('no origin (older launcher): plain emit', run(eventScript('menu', {}, undefined), {}).length === 1);

console.log(fail ? `${fail} FAILED` : 'PASS event gate');
tjs.exit(fail ? 1 : 0);
