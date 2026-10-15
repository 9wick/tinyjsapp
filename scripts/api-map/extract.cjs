// Walk the Tiny (page) and TinyApp (backend) interfaces in tiny.d.ts and
// emit every callable/value member with its signature, doc and @deprecated.
const ts = require('typescript');
const file = process.argv[2];
const prog = ts.createProgram([file], { lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], strict: true });
const ck = prog.getTypeChecker();
const sf = prog.getSourceFile(file);
const ifaces = {};
ts.forEachChild(sf, (n) => { if (ts.isInterfaceDeclaration(n)) ifaces[n.name.text] = n; });
const out = [];
const docOf = (sym) => ts.displayPartsToString(sym.getDocumentationComment(ck)).trim();
const depOf = (sym) => {
  const t = sym.getJsDocTags(ck).find((t) => t.name === 'deprecated');
  return t ? (ts.displayPartsToString(t.text) || 'deprecated') : null;
};
function walk(type, path, decl, depth) {
  for (const p of ck.getPropertiesOfType(type)) {
    const name = p.getName();
    if (name === 'toJSON') continue;
    const pt = ck.getTypeOfSymbolAtLocation(p, decl);
    const sigs = pt.getCallSignatures();
    const full = path + '.' + name;
    if (sigs.length) {
      out.push({ path: full, kind: 'fn', sig: sigs.map((s) => ck.signatureToString(s, undefined, ts.TypeFormatFlags.NoTruncation)), doc: docOf(p), deprecated: depOf(p) });
      continue;
    }
    const props = ck.getPropertiesOfType(pt);
    const isPromise = pt.getSymbol()?.getName() === 'Promise';
    const nested = !isPromise && !!(pt.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) && !(pt.flags & ts.TypeFlags.StringLike) && props.some((q) => ck.getTypeOfSymbolAtLocation(q, decl).getCallSignatures().length);
    if (nested && depth < 4 && !(pt.flags & ts.TypeFlags.Union)) walk(pt, full, decl, depth + 1);
    else out.push({ path: full, kind: 'value', sig: [ck.typeToString(pt, undefined, ts.TypeFormatFlags.NoTruncation)], doc: docOf(p), deprecated: depOf(p) });
  }
}
for (const [iface, root] of [['Tiny', 'tiny'], ['TinyApp', 'app']]) {
  const d = ifaces[iface];
  walk(ck.getTypeAtLocation(d), root, d, 0);
}
// app.window(id) handle
const h = ifaces.TinyWindowHandle;
walk(ck.getTypeAtLocation(h), 'app.window(id)', h, 1);
console.log(JSON.stringify(out, null, 1));
