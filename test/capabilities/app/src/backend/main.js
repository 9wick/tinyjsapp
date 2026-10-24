// Opens the app's own page next to the wrapped site, stores what
// tiny.capabilities told each one, and quits.
const reports = {};
export async function init(app) {
  app.win.open('own', { page: 'own.html', size: '400x300' });
}
export const api = {
  report: async ({ who, ...r }, app) => {
    reports[who] = r;
    if (Object.keys(reports).length === 2) {
      await app.store.set('capabilities', reports);
      setTimeout(() => app.quit(), 100);
    }
    return true;
  },
};
