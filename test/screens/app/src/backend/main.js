// Multi-screen probe (#70) — see ../../README.md. Drives every screen through
// the three coordinate spaces and the helpers, writes results to
// $SCREENS_OUT (or prints them), then quits. SCREENS_PHASE=restore instead
// only reports where rememberWindows put the window at boot.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

const sysEvents = [];
export function onSystem(kind) {
  if (kind === 'screens') sysEvents.push({ kind, at: Date.now() });
}

export function init(app) {
  const phase = tjs.env.SCREENS_PHASE || 'probe';
  (phase === 'restore' ? restore(app) : phase === 'watch' ? watch(app) : probe(app))
    .catch((e) => finish(app, { fatal: String(e?.stack ?? e) }));
}

async function probe(app) {
  const out = { fails: [] };
  const check = (name, ok, got) => { if (!ok) out.fails.push({ name, got }); };
  const step = async (k, fn) => {
    try { out[k] = await fn(); } catch (e) { out[k] = 'THREW ' + (e?.message ?? e); }
  };
  await sleep(1500);
  const main = app.window('main');
  main.setSize(400, 300);
  await sleep(300);

  const screens = await app.screens();
  out.screens = screens;
  for (const s of screens) {
    check(`fields ${s.id}`, typeof s.uid === 'string' && s.uid && typeof s.internal === 'boolean' &&
      s.pixels && near(s.pixels.width, s.width * s.scale) && near(s.pixels.height, s.height * s.scale), s);
  }

  // The round-trip: set in each space, read back, must agree (±1 for the
  // rounding a fractional scale forces).
  out.roundTrip = [];
  for (const s of screens) {
    const vx = s.visible.x - s.x, vy = s.visible.y - s.y;  // stay off the menu bar
    const cases = [
      { label: 'global pt', set: () => main.setPosition(s.x + vx + 120, s.y + vy + 90),
        want: (st) => near(st.x, s.x + vx + 120) && near(st.y, s.y + vy + 90) },
      { label: 'local pt', set: () => main.setPosition(vx + 100, vy + 80, { screen: s.id }),
        want: (st) => near(st.local.x, vx + 100) && near(st.local.y, vy + 80) },
      { label: 'local px', set: () => main.setPosition((vx + 60) * s.scale + 1, (vy + 50) * s.scale + 1, { screen: s, units: 'px' }),
        want: (st) => near(st.pixels.x, (vx + 60) * s.scale + 1) && near(st.pixels.y, (vy + 50) * s.scale + 1) },
    ];
    for (const c of cases) {
      c.set();
      await sleep(250);
      const st = await main.getState();
      const ok = st.screenId === s.id && c.want(st);
      out.roundTrip.push({ screen: s.id, case: c.label, ok, x: st.x, y: st.y, local: st.local, pixels: st.pixels, screenId: st.screenId });
      check(`roundTrip ${s.id} ${c.label}`, ok, st);
      // and set(get()) must not move it
      main.setPosition(st.x, st.y);
      await sleep(200);
      const again = await main.getState();
      check(`set(get) ${s.id} ${c.label}`, again.x === st.x && again.y === st.y, [st.x, st.y, again.x, again.y]);
    }
    const mid = await app.screenAt(s.x + s.width / 2, s.y + s.height / 2);
    check(`screenAt ${s.id}`, mid?.id === s.id, mid?.id);
    const fr = await app.screenFor({ x: s.x + 10, y: s.y + 10, width: 50, height: 50 });
    check(`screenFor ${s.id}`, fr?.id === s.id, fr?.id);
  }
  await step('screenAtNowhere', () => app.screenAt(-100000, -100000));
  check('screenAtNowhere', out.screenAtNowhere === null, out.screenAtNowhere);

  // px size: the page's box in the window's screen's pixels
  await step('pxSize', async () => {
    main.setSize(601, 401, { units: 'px' });
    await sleep(300);
    const st = await main.getState();
    return st.pixels;
  });
  {
    const sid = (await main.getState()).screenId;
    const s = screens.find((o) => o.id === sid);
    // a 2x screen can't hold an odd pixel width: points round to half-points
    check('pxSize', near(out.pxSize?.width, 601, s?.scale ?? 1) && near(out.pxSize?.height, 401, s?.scale ?? 1), out.pxSize);
  }
  await step('pxWithoutScreen', () => main.setPosition(10, 10, { units: 'px' }));
  check('pxWithoutScreen', String(out.pxWithoutScreen).startsWith('THREW'), out.pxWithoutScreen);

  await step('foreground', () => app.foregroundScreen());
  check('foreground', out.foreground === null || screens.some((s) => s.id === out.foreground.id), out.foreground);
  await step('mouseScreenId', async () => (await app.mousePosition()).screen.id);
  check('mouseScreenId', screens.some((s) => s.id === out.mouseScreenId), out.mouseScreenId);

  // matchScreen: exact, a replug (new id + uid, same panel), and a stranger
  const s0 = screens[0];
  await step('matchExact', async () => (await app.matchScreen(s0))?.id);
  check('matchExact', out.matchExact === s0.id, out.matchExact);
  await step('matchReplug', async () => (await app.matchScreen({ ...s0, id: 999999, uid: 'gone', rank: 0 }))?.id);
  check('matchReplug', out.matchReplug === s0.id, out.matchReplug);
  await step('matchStranger', () => app.matchScreen({ uid: 'x', name: 'Nope', width: 1, height: 1, scale: 7, primary: false, internal: false }));
  check('matchStranger', out.matchStranger === null, out.matchStranger);

  // a secondary window born on a screen, at a local position
  const last = screens[screens.length - 1];
  const lvx = last.visible.x - last.x, lvy = last.visible.y - last.y;
  await step('openOnScreen', async () => {
    app.win.open('probe2', { page: 'index.html', size: '300x200', screen: last.id, x: lvx + 50, y: lvy + 60 });
    await sleep(1200);
    const st = await app.window('probe2').getState();
    app.window('probe2').close();
    return { screenId: st?.screenId, local: st?.local };
  });
  check('openOnScreen', out.openOnScreen?.screenId === last.id && near(out.openOnScreen.local.x, lvx + 50) &&
    near(out.openOnScreen.local.y, lvy + 60), out.openOnScreen);

  // fullscreen on a chosen screen (the last one), then back
  await step('fullscreenOn', async () => {
    main.setFullscreen(true, { screen: last.id });
    await sleep(2000);
    const st = await main.getState();
    main.setFullscreen(false);
    await sleep(2000);
    return { fullscreen: st.fullscreen, screenId: st.screenId };
  });
  check('fullscreenOn', out.fullscreenOn?.fullscreen === true && out.fullscreenOn.screenId === last.id, out.fullscreenOn);

  // leave a known placement for the restore phase (rememberWindows saves it)
  const tgt = screens[screens.length - 1];
  const tvx = tgt.visible.x - tgt.x, tvy = tgt.visible.y - tgt.y;
  main.setSize(500, 350);
  main.setPosition(tvx + 150, tvy + 120, { screen: tgt.id });
  await sleep(1500);
  out.leftAt = { screen: tgt.id, uid: tgt.uid, local: { x: tvx + 150, y: tvy + 120 }, size: [500, 350] };
  out.ok = out.fails.length === 0;
  finish(app, out);
}

async function restore(app) {
  // the bridge restores before showing; give it a beat to land
  await sleep(1500);
  const st = await app.window('main').getState();
  const screens = await app.screens();
  const s = screens.find((o) => o.id === st.screenId);
  finish(app, { screenId: st.screenId, uid: s?.uid, local: st.local, size: [st.width, st.height], visible: st.visible });
}

// SCREENS_PHASE=watch: sit for SCREENS_WATCH_MS while the harness plugs /
// unplugs a display; report onSystem('screens') calls, the page's
// 'screens-changed' events, and the screens before and after.
async function watch(app) {
  const before = (await app.screens()).map((s) => s.id);
  await app.store.set('seen', []);
  await sleep(2000);   // the page needs `tiny` before it can subscribe
  app.eval(`tiny.app.onScreensChanged(async (l) => {
    const seen = (await tiny.store.get('seen')) || [];
    seen.push(l.map((s) => s.id));
    await tiny.store.set('seen', seen);
  })`);
  await sleep(+(tjs.env.SCREENS_WATCH_MS || 10000));
  const after = (await app.screens()).map((s) => s.id);
  const st = await app.window('main').getState();
  finish(app, { before, after, sysEvents, pageSeen: await app.store.get('seen'),
                mainAfter: { screenId: st.screenId, x: st.x, y: st.y } });
}

async function finish(app, out) {
  const json = JSON.stringify(out, null, 2);
  const path = tjs.env.SCREENS_OUT;
  if (path) await tjs.writeFile(path, new TextEncoder().encode(json));
  else console.log(json);
  app.quit();
}
