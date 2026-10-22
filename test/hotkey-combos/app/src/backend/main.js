const fired = [];
export function onHotkey(id, app) { fired.push(id); }
export async function init(app) {
  const registered = {
    sk: await app.hotkey.register('sk', 'super+k'),     // must mean Cmd+K on macOS, and succeed
    bad: await app.hotkey.register('bad', 'hyper+j'),   // must be refused, never a bare J
  };
  await new Promise((r) => setTimeout(r, 1500));
  app.win.show();
  const r = await app.keystroke('cmd+k');
  await new Promise((r) => setTimeout(r, 1500));
  await app.store.set('hotkeytest', { registered, keystroke: r, fired });
  app.quit();
}
