const asked = [];
export function onWindowOpen(info) { asked.push(info.url); return 'deny'; }
export const api = {
  done: async ({ events }, app) => {
    await app.store.set('popuptest', { asked, events });
    setTimeout(() => app.quit(), 100);
    return true;
  },
};
