async function assertWindowless(app) {
  const windows = await app.win.windows();
  if (windows.length !== 0)
    throw new Error('Expected no app windows, got ' + JSON.stringify(windows));
}

export async function init(app) {
  await assertWindowless(app);
  app.tray.set({ title: 'Dialog Test', icon: 'sf:checkmark.circle', menu: [
    { id: 'confirm', label: 'Confirm' },
    { id: 'save', label: 'Save' },
    { separator: true },
    { id: 'quit', label: 'Quit' },
  ] });
  console.log('READY: choose Confirm or Save from the Dialog Test tray menu');
}

export async function onTray(id, app) {
  if (id === 'quit') return app.quit();
  if (id !== 'confirm' && id !== 'save') return;

  await assertWindowless(app);
  console.log('DIALOG', id);
  const result = id === 'confirm'
    ? await app.dialog.confirm('Continue from the tray?', { ok: 'Continue', cancel: 'Cancel' })
    : await app.dialog.saveFile({ types: ['json'], name: 'report.json' });
  await assertWindowless(app);
  console.log('PASS tray ' + id + ': ' + JSON.stringify(result) + '; no app windows');
}
