// scripts/api-map's runtime half: walks the live backend `app` (and an
// app.window() handle), the page walks `tiny`, and the page sends both
// lists back to be written to $DUMP_OUT. run.sh starts it; it quits itself.
// render.py then flags anything that exists at runtime but not in tiny.d.ts.
const walk = (obj, path, out, depth = 0, seen = new Set()) => {
  if (!obj || seen.has(obj) || depth > 4) return out;
  seen.add(obj);
  for (const k of Object.keys(obj)) {
    if (k === 'toJSON') continue;
    let v; try { v = obj[k]; } catch { continue; }
    const p = path + '.' + k;
    if (typeof v === 'function') out.push(p);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const before = out.length; walk(v, p, out, depth + 1, seen);
      if (out.length === before) out.push(p);
    } else out.push(p);
  }
  return out;
};
export const api = {
  backend: async () => globalThis.__backend,
  report: async (p) => {
    await tjs.writeFile(tjs.env.DUMP_OUT, new TextEncoder().encode(JSON.stringify(p)));
    console.log('DUMPED', p.page.length, p.backend.length);
    setTimeout(() => globalThis.__app.quit(), 300);
    return true;
  },
};
export function init(app) {
  globalThis.__app = app;
  globalThis.__backend = [...walk(app, 'app', []), ...walk(app.window('main'), 'app.window(id)', [])];
}
