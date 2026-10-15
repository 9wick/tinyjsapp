# Renders docs/api-map.html: every backend `app` call beside its page `tiny`
# twin. Inputs: the d.ts walk from extract.cjs and the live-object dump from
# dump-app (see run.sh). Borrows docs.html's <style> so the page matches.
import json, re, html, sys, os
REPO=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
d=json.load(open(sys.argv[1])); rt=json.load(open(sys.argv[2]))
style=re.search(r'<style>.*?</style>', open(REPO+'/docs/docs.html').read(), re.S).group(0)
esc=lambda s: html.escape(s, quote=False)

def split_sig(s):
    s=s.replace(' | undefined','')
    depth=0
    for i,c in enumerate(s):
        if c=='(': depth+=1
        elif c==')':
            depth-=1
            if depth==0: return s[1:i], s[i+3:]
    return s, ''
def unwrap(r):
    m=re.fullmatch(r'Promise<(.*)>', r.strip())
    r=m.group(1) if m else r.strip()
    return 'ACK' if r in ('any','void','true','boolean','undefined') else r

entries={}
for x in d:
    p=x['path']
    if p.startswith('app.window(id)'): continue
    if p.startswith('tiny.app.'): side,key='page',p[9:]
    elif p.startswith('tiny.'): side,key='page',p[5:]
    elif p.startswith('app.'): side,key='back',p[4:]
    else: continue
    entries.setdefault(key,{})[side]=x
# runtime-only members (not in tiny.d.ts)
dpaths={x['path'] for x in d}
for p in sorted(set(rt['backend'])|set(rt['page'])):
    if p in dpaths or p.startswith('app.window(id)'): continue
    side,key=('back',p[4:]) if p.startswith('app.') else ('page',p[9:] if p.startswith('tiny.app.') else p[5:])
    entries.setdefault(key,{})[side]={'path':p,'kind':'fn','sig':['(…)'],'doc':'','deprecated':None,'undeclared':True}

# backend top-level main-window ops that duplicate app.win.X fold into that row
alias={}
for k,v in list(entries.items()):
    if 'back' in v and 'page' not in v and '.' not in k and ('win.'+k) in entries and 'back' in entries['win.'+k] and not v['back'].get('deprecated') and k != 'push':
        alias['win.'+k]=v['back']['path']; del entries[k]
deprecated={k:v for k,v in entries.items() if 'back' in v and v['back'].get('deprecated') and 'page' not in v}
for k in deprecated: del entries[k]

SECTIONS=[
 ('bridge','Bridge',['api','fetch','proxyURL','fileURL','log','push','eval','reload','spawnHidden','debug','done']),
 ('win','Windows',['win','window']),
 ('menu','Menus',['menu']),('tray','Tray',['tray']),('hotkey','Hotkeys',['hotkey']),
 ('dialog','Dialogs',['dialog']),('notify','Notifications',['notify']),
 ('app','App',None),
 ('system','System',['system']),('theme','Theme',['theme']),
 ('clipboard','Clipboard',['clipboard']),('store','Store',['store']),
 ('audio','Audio',['audio','audioTap']),('macos','macOS only',['macos']),
]
def section_of(k):
    head=k.split('.')[0]
    for sid,_,heads in SECTIONS:
        if heads and head in heads: return sid
    return 'app'

def cell(x, other=None, extra=None):
    if not x: return '<td class="none">—</td>'
    out=[]
    for s in x['sig']:
        name=x['path']
        if x['kind']=='value':
            out.append(f'<code class="sig"><b>{esc(name)}</b>: {esc(s)}</code>')
        else:
            params,ret=split_sig(s)
            out.append(f'<code class="sig"><b>{esc(name)}</b>({esc(params)})' + (f' <span class="ret">→ {esc(ret)}</span>' if ret else '') + '</code>')
    if extra: out.append(f'<div class="alias">also <code>{esc(extra)}()</code> (main window)</div>')
    if x.get('undeclared'): out.append('<div class="flag">not in tiny.d.ts</div>')
    return '<td>'+''.join(out)+'</td>'

def status(v):
    b,p=v.get('back'),v.get('page')
    if b and not p: return ('back','backend only')
    if p and not b: return ('page','page only')
    if b['kind']!=p['kind']: return ('diff','differs')
    if b['kind']=='value': return ('same','same')
    bp,br=split_sig(b['sig'][0]); pp,pr=split_sig(p['sig'][0])
    if len(b['sig'])!=len(p['sig']) or re.sub(r'\s','',bp)!=re.sub(r'\s','',pp): return ('diff','args differ')
    if unwrap(br)!=unwrap(pr): return ('ret','returns differ')
    return ('same','same')

def first_sentence(t):
    t=' '.join(t.split())
    m=re.match(r'(.+?\.)(\s|$)', t)
    return (m.group(1) if m else t)[:220]

for k,v in entries.items():
    b,p=v.get('back'),v.get('page')
    # app.win's type merges the handle's close() with its own close(id?);
    # only there is a second signature an artefact rather than an overload
    if k.startswith('win.') and b and p and b['kind']=='fn' and len(b['sig'])>1:
        pp=re.sub(r'\s','',split_sig(p['sig'][0])[0])
        m=[x for x in b['sig'] if re.sub(r'\s','',split_sig(x)[0])==pp]
        if m: b['sig']=m[-1:]
NOTES={
  'push': 'push an event to EVERY window (tiny.api.on) — app.win.push reaches main only.',
  'win.push': 'main only — app.push broadcasts to every window.',
}
rows_by={sid:[] for sid,_,_ in SECTIONS}
counts={}
for k in sorted(entries, key=lambda k: (k.split('.')[0], k)):
    v=entries[k]; sid=section_of(k)
    st=status(v); counts[st[1]]=counts.get(st[1],0)+1
    doc=(v.get('page') or {}).get('doc') or (v.get('back') or {}).get('doc') or ''
    if k in NOTES: doc=NOTES[k]
    rows_by[sid].append(
      f'<tr class="st-{st[0]}">{cell(v.get("back"), extra=alias.get(k))}{cell(v.get("page"))}'
      f'<td class="note"><span class="badge b-{st[0]}">{st[1]}</span>'
      + (f'<div class="doc">{esc(first_sentence(doc))}</div>' if doc else '') + '</td></tr>')

EVENTS=[
 ('onMenu(id, app)','tiny.menu.on(fn)','menu bar click'),
 ('onContextMenu(id, app)','tiny.menu.onContext(fn)','custom right-click menu click'),
 ('onTray(id | null, app)','tiny.tray.on(fn) / tiny.tray.onClick(fn)','tray menu item / bare icon click (one hook on the backend, two on the page)'),
 ('onHotkey(id, app)','tiny.hotkey.on(fn)','global hotkey pressed'),
 ('onSystem(kind, value, app)','tiny.theme.on(fn(dark))','theme / sleep / wake — the page has sugar for theme only; sleep/wake via tiny.api.on'),
 ('onLocale(info, app)','tiny.api.on(\'locale\', fn)','no page sugar; macOS only for now (no locale reader on Windows/Linux)'),
 ('onOpenUrl(url, app)','tiny.app.onOpenUrl(fn)',''),
 ('onOpenFiles(paths, app)','tiny.app.onOpenFiles(fn)',''),
 ('onNotificationClick(id, app)','tiny.app.onNotificationClick(fn)',''),
 ('onNotificationAction(info, app)','tiny.app.onNotificationAction(fn)',''),
 ('onMediaKey(info, app)','tiny.app.onMediaKey(fn)',''),
 ('onWindowState(info, app)','tiny.win.onState(fn)','broadcast to every window'),
 ('onWindowClosed(id, app)','tiny.api.on(\'window-closed\', fn)','no page sugar; the page gets { id }, the hook a bare id'),
 ('onClipboardChange(info, app)','tiny.clipboard.onChange(fn)','both start a watch'),
 ('onAudioTap(chunk, app)','tiny.audioTap.on(fn)','only a page can start the tap'),
 ('onUpdateAvailable(info, app)','tiny.api.on(\'update-available\', fn)','no page sugar'),
 ('—','tiny.win.onDrop(fn)','page only; the launcher\'s drop carries no window id, so every window hears it'),
 ('onNavigate(info, app)','tiny.api.on(\'navigate\', fn)','pages hear the lifecycle (start/commit/finish/fail/crash); only the backend answers the policy ask'),
 ('onDownload(info, app)','tiny.api.on(\'download\', fn)','pages hear progress; only the backend answers the policy ask'),
 ('onWindowOpen(info, app)','tiny.api.on(\'popup\', fn)','backend decides; the page hears \'popup\' (no kind field)'),
]
def ev_rows():
    r=[]
    for b,p,n in EVENTS:
        st='same' if b!='—' and p!='—' else ('back' if p=='—' else 'page')
        r.append(f'<tr class="st-{st}"><td>' + ('<span class="none">—</span>' if b=='—' else f'<code class="sig">export function <b>{esc(b.split("(")[0])}</b>({esc(b.split("(",1)[1][:-1])})</code>') +
                 '</td><td>' + ('<span class="none">—</span>' if p=='—' else f'<code class="sig">{esc(p)}</code>') +
                 f'</td><td class="note">{esc(n)}</td></tr>')
    return '\n'.join(r)

dep_rows=[]
for k in sorted(deprecated):
    b=deprecated[k]['back']
    dep_rows.append(f'<tr class="st-dep">{cell(b)}<td class="note">{esc(b["deprecated"])}</td></tr>')

THEAD='<thead><tr><th>backend <code>app</code></th><th>page <code>tiny</code></th><th>notes</th></tr></thead>'
secs=[]; toc=[]
for sid,title,_ in SECTIONS:
    if not rows_by[sid]: continue
    toc.append(f'<a href="#{sid}">{esc(title.lower())}</a>')
    secs.append(f'<section id="{sid}"><h2>{esc(title)}</h2><div class="tw"><table>{THEAD}<tbody>\n'+'\n'.join(rows_by[sid])+'\n</tbody></table></div></section>')
toc.append('<a href="#events">events</a>'); toc.append('<a href="#deprecated">deprecated</a>')
summary=' · '.join(f'{v} {k}' for k,v in sorted(counts.items(), key=lambda kv:-kv[1]))

extra_css='''<style>
  .wrap { max-width: 1240px; }
  .lede { color: var(--muted); max-width: 72ch; }
  .tw { overflow-x: auto; margin: 0 -4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
  th { text-align: left; font-weight: 600; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 12px; }
  th:nth-child(3), td.note { width: 26%; }
  td { vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  code.sig { display: block; font-family: var(--mono); font-size: 12px; line-height: 1.5; background: none; border: 0; padding: 0; white-space: normal; color: var(--muted); }
  code.sig + code.sig { margin-top: 4px; }
  code.sig b { color: var(--text); font-weight: 600; }
  .ret { color: var(--muted); }
  td.none, .none { color: var(--muted); opacity: .5; }
  .doc { color: var(--muted); font-size: 12px; margin-top: 4px; line-height: 1.45; }
  .alias, .flag { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
  .flag { color: var(--accent); }
  .badge { display: inline-block; font-family: var(--mono); font-size: 10.5px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); color: var(--muted); }
  .b-diff, .b-ret { color: var(--accent); border-color: var(--accent); background: var(--wash); }
  tr.st-same td:first-child, tr.st-same td:nth-child(2) { }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 8px; font-size: 13px; color: var(--muted); align-items: center; }
  .filters label { display: inline-flex; gap: 5px; align-items: center; cursor: pointer; }
  body.hide-same tr.st-same { display: none; }
  .apitoc { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; margin: 14px 0 0; }
  .apitoc a { color: var(--accent); text-decoration: none; }
  @media (max-width: 720px) { table { table-layout: auto; } th:nth-child(3), td.note { width: auto; } }
</style>'''

head_meta='''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tinyjs — API map</title>
<link rel="icon" href="images/rakali-badge-small.webp" type="image/webp">
<meta name="theme-color" content="#fcfcfa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101318" media="(prefers-color-scheme: dark)">
<script>
  try {
    var t = localStorage.getItem('tinyjs-theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) {}
</script>
'''
page=f'''{head_meta}{style}
{extra_css}
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><a class="mark" href="./index.html"><img src="images/rakali-badge.svg" alt="" width="30" height="30">tinyjs</a> <span class="links"><a href="./docs.html">docs</a><a href="./changelog.html">changelog</a></span><button class="theme" onclick="cycleTheme()" title="Theme — click to cycle auto / light / dark" aria-label="Change theme"></button></div>
    <h1>api <em>map</em></h1>
    <p class="sub lede">Every call on the backend's <code>app</code> next to its page twin on
    <code>tiny</code>, one row per operation. A page's <code>tiny.app.X</code> is the backend's
    <code>app.X</code>, and <code>tiny.win.X</code> (the page's own window) pairs with
    <code>app.win.X</code> (the main window); <code>app.window(id)</code> handles have the same
    window methods as <code>app.win</code> minus <code>open</code>, <code>windows</code> and
    <code>setHideOnClose</code>, and their <code>close()</code> takes no id.
    Generated from <code>tiny.d.ts</code>, checked against the live <code>app</code> and
    <code>tiny</code> objects and line by line against the code — {summary}.</p>
    <nav class="apitoc">{"".join(toc)}</nav>
    <div class="filters"><label><input type="checkbox" onchange="document.body.classList.toggle('hide-same', this.checked)"> hide rows that match</label>
    <span>· "returns differ" mostly means the page resolves <code>true</code> where the backend returns nothing</span></div>
  </header>
{chr(10).join(secs)}
<section id="events"><h2>Events</h2>
<p class="lede">The backend hooks are exports of your backend module, wired once at startup; the page subscribes at runtime and gets back an unsubscribe function.</p>
<div class="tw"><table>{THEAD}<tbody>
{ev_rows()}
</tbody></table></div></section>
<section id="deprecated"><h2>Deprecated backend names</h2>
<p class="lede">Still work, log a one-line warning the first time each is used, and will be removed in a future release.</p>
<div class="tw"><table><thead><tr><th>old backend name</th><th>use instead</th></tr></thead><tbody>
{chr(10).join(dep_rows)}
<tr class="st-dep"><td><code class="sig"><b>app.notify</b>({{ title, body, …opts }})</code></td><td class="note">app.notify(title, body, opts)</td></tr>
<tr class="st-dep"><td><code class="sig"><b>app.info.version</b>, <b>app.paths.data</b>, …</code></td><td class="note">(await app.info()).version, (await app.paths()).data</td></tr>
<tr class="st-dep"><td><code class="sig"><b>app.presence</b>(anything but 'normal' | 'menubar')</code></td><td class="note">will throw, as the page call does</td></tr>
</tbody></table></div></section>
</div>
<script>
function cycleTheme() {{
  var el = document.documentElement;
  var order = ['auto', 'light', 'dark'];
  var next = order[(order.indexOf(el.dataset.theme || 'auto') + 1) % 3];
  if (next === 'auto') delete el.dataset.theme; else el.dataset.theme = next;
  try {{
    if (next === 'auto') localStorage.removeItem('tinyjs-theme');
    else localStorage.setItem('tinyjs-theme', next);
  }} catch (e) {{}}
}}
</script>
</body>
</html>
'''
open(REPO+'/docs/api-map.html','w').write(page)
print(summary, '| deprecated rows', len(dep_rows), '| aliases', len(alias))
