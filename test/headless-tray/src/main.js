export const api = {
  testDialogs: async () => tjs.env.TINYJS_HEADLESS_TEST === 'dialogs',
  report: async (params) => { console.log('PAGE', JSON.stringify(params)); return true; },
};

export function init(app) {
  app.tray.set({ title: 'Headless Test', icon: 'sf:camera', menu: [
    { id: 'open', label: 'Open editor' },
    { id: 'close', label: 'Close editor' },
    { separator: true },
    { id: 'quit', label: 'Quit' },
  ] });
  // TINYJS_HEADLESS_TEST is only a fixture switch, not a runtime API.
  if (tjs.env.TINYJS_HEADLESS_TEST) {
    setTimeout(async () => {
      console.log('BOOT', JSON.stringify(await app.windows()), JSON.stringify(await app.tray.position()));
      console.log('MENU', JSON.stringify(await app.getMenuItem('open')));
    }, 1000);
    setTimeout(() => onTray('open', app), 7000);
    setTimeout(() => onTray('close', app), 15000);
    setTimeout(async () => console.log('CLOSED', JSON.stringify(await app.windows())), 17000);
    setTimeout(() => onTray('open', app), 24000);
    setTimeout(() => onTray('close', app), 32000);
    setTimeout(async () => console.log('CLOSED_AGAIN', JSON.stringify(await app.windows())), 34000);
    setTimeout(() => app.quit(), 41000);
  }
}

export function onTray(id, app) {
  if (id === 'open') {
    app.openWindow('editor', { page: 'editor.html', title: 'Editor', size: '400x300' });
    app.window('editor').show();
  }
  if (id === 'close') app.window('editor').close();
  if (id === 'quit') app.quit();
}

export function onWindowClosed(id) { console.log('WINDOW_CLOSED', id); }
