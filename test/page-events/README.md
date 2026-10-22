# Page events: a throwing listener doesn't stop the rest

`cd test/page-events/app && tinyjs dev` — the page adds two
`tiny.api.on('ping')` listeners (the first throws), the backend pushes
`ping` twice, the page stores what ran and the app quits.

`store.json` → `"emittest"` should be
`{"got": ["first 1", "second 1", "first 2", "second 2"], "reported": 2}`.
Before the fix the second listener never ran: `["first 1", "first 2"]`.
