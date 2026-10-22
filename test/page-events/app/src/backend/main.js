export const api = {
  ready: (_, app) => { setTimeout(() => { app.push('ping', { n: 1 }); app.push('ping', { n: 2 }); }, 200); return true; },
  done: (_, app) => { setTimeout(() => app.quit(), 100); return true; },
};
