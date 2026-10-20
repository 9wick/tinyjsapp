# app.cookies probe (#46)

Checks the backend's `app.cookies` against the webview's real jar: an
HttpOnly cookie a site set is readable, a cookie the backend sets rides the
webview's next request, and remove/filters behave the same on every OS.

1. `python3 test/cookies/server.py` (127.0.0.1:8799, stdlib only)
2. `cd test/cookies/app && COOKIE_OUT=/abs/path/out.json tinyjs dev`
   — the app wraps `/login`, runs the checks after ~3 s, loads `/echo`,
   and quits.
3. Read `out.json`, and server.py's `ECHO Cookie:` line.

Start from an empty jar (the app quits after clearing what it set; delete
`app.tinyjs.cookieprobe`'s WebKit/WebView2 data if a run died midway).

| key | expected |
|---|---|
| `fromPage` | `sid=s3cret … httpOnly=true sameSite=lax expires=null` and `vis=1 … httpOnly=false` |
| `set` | `true` |
| `readBack` | one `injected` cookie: `httpOnly: true`, `sameSite: "lax"`, `expiresInMin: 60`, `domain: "127.0.0.1"` |
| `session` | `[["a b=c", null]]` |
| `otherPath` | `[0, 1, 0]` (`/admin` cookie: not on `/`, yes on `/admin/x`, not on `/adminx`) |
| `badName` / `badValue` / `noWhere` | `THREW …` (`;`, CR/LF, no url or domain) |
| `removeVis` / `removeExact` | `1` |
| `removeMissing` | `0` |
| `afterRemove` | `["injected", "sess", "sid"]` |
| `clear` / `afterClear` | `3` / `0` |
| server.py | `ECHO Cookie: injected=v1; sess=a b=c; sid=s3cret` (any order; no `vis`, no `deep`) |

`all` is the whole-jar count (no url): `2` on a clean jar; on Linux older
than WebKitGTK 2.42 it is `THREW …2.42+…`.
