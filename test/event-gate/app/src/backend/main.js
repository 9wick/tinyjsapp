// Pushes six events to every window once both pages are ready, then stores
// what each page says it received.
const ready = new Set(), reports = {};
export async function init(app) {
  app.win.open('own', { page: 'own.html', size: '400x300' });
}
export const api = {
  ready: ({ who }, app) => {
    ready.add(who);
    if (ready.size === 2) setTimeout(() => {
      app.push('menu', { id: 'about' });
      app.push('theme', true);
      app.push('open-url', { url: 'myapp://callback?code=SECRET' });
      app.push('drop', { paths: ['/Users/me/secret.txt'] });
      app.push('download', { path: '/Users/me/Downloads/x' });
      app.push('tick', { n: 1 });
    }, 300);
    return true;
  },
  report: async ({ who, got }, app) => {
    reports[who] = got;
    if (Object.keys(reports).length === 2) {
      await app.store.set('eventgate', reports);
      setTimeout(() => app.quit(), 100);
    }
    return true;
  },
};
