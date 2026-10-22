# rel=noopener popups reach onWindowOpen

`cd test/popup-noopener/app && tinyjs dev` — `"popups": "deny"`, so nothing
opens. The page clicks a `target=_blank rel=noopener` link and calls
`window.open(…, 'noopener')`; the backend's `onWindowOpen` records what it
was asked (twice per popup: the policy ask, then the outcome) and the page
records the `popup` events.

`store.json` → `"popuptest"` should list BOTH urls in `asked` and `events`.
Before the fix (macOS), the link never reached the hook or the event: WebKit
sends it as a navigation with no target frame, which opened the browser
directly.
