const assert = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pageDone;
const pageReport = new Promise(resolve => { pageDone = resolve; });

export const api = { report: async (result) => { pageDone(result); return true; } };

export async function init(app) {
  try {
    assert(same(await app.win.windows(), []), 'must start without windows');
    const step = async (name, action, fn, expected) => {
      console.log('DIALOG', name, action);
      const result = await fn();
      assert(same(result, expected), name + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(result));
      assert(same(await app.win.windows(), []), name + ': created an app window');
    };
    await step('alert', 'ok', () => app.dialog.alert('Finished', { detail: 'First\nSecond', ok: 'Done' }), true);
    await step('confirm', 'ok', () => app.dialog.confirm('Continue?', 'Details'), true);
    await step('confirm', 'cancel', () => app.dialog.confirm('Continue?', { cancel: 'Stop' }), false);
    await step('prompt', 'ok', () => app.dialog.prompt('Name', { default: '' }), '');
    await step('prompt', 'cancel', () => app.dialog.prompt('Name', { default: 'value' }), null);
    for (const method of ['openFile', 'openFiles', 'pickFolder', 'saveFile'])
      await step(method, 'cancel', () => app.dialog[method](), null);

    // TINYJS_DIALOG_FIXTURES: an absolute directory containing one.json.
    // With it set, the driver also accepts real file/folder selections.
    const dir = tjs.env.TINYJS_DIALOG_FIXTURES;
    if (dir) {
      const windows = app.system.isWindows();
      const base = windows ? dir.replace(/\//g, '\\') : dir;
      const file = (name) => base + (windows ? '\\' : '/') + name;
      await step('openFile', 'file', () => app.dialog.openFile({ types: ['.JSON'] }), file('one.json'));
      await step('openFiles', 'file', () => app.dialog.openFiles({ types: ['json'] }), [file('one.json')]);
      await step('pickFolder', 'folder', () => app.dialog.pickFolder(), base);
      await step('saveFile', 'save', () => app.dialog.saveFile({ types: ['json'], name: '../report.json' }), file('report.json'));
    }
    console.log('PASS windowless native dialogs');
    app.win.open('gate', { page: 'index.html' });
    assert(await pageReport === true, 'page dialog must be denied by the gate');
    console.log('PASS page gate');
    app.quit();
  } catch (e) {
    console.log('FAIL', String(e));
    app.quit();
  }
}
