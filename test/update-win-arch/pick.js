// One update check against a manifest given on argv; prints which download
// the Windows overlay picked. Driven by check.py with a faked Windows env.
import { checkForUpdate } from '../../runtime/update.js';
const manifest = JSON.parse(tjs.args[3]);
globalThis.fetch = async (url) => ({ ok: true, url, json: async () => JSON.parse(JSON.stringify(manifest)) });
const r = await checkForUpdate({ url: 'https://host/manifest.json', version: '1.0.0' });
console.log(JSON.stringify({ available: r.available, url: r.available ? r.manifest.url : null }));
