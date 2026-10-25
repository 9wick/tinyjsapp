# drag-race — `win.startDrag` vs `[NSApp currentEvent]` (#92)

Reproduces the race behind tarwin/tinyjsapp#92 without a trackpad: a burst
of scrollwheel events poisons `[NSApp currentEvent]` between the page's
mousedown and the async `DRAGWIN` dispatch, so the pre-fix type check in
`do_dragwin` saw a scroll event and silently no-oped.

- `app/` — frameless test app. `#plain` strip: normal `data-tiny-drag`.
  `#poison` strip: no `data-tiny-drag`; its own handler calls
  `tiny.win.startDrag()` 350 ms after mousedown, deliberately past the
  scroll burst. `#nobtn` button: `startDrag()` with no button held
  (must no-op). Each handler records itself in `tiny.store` so the run
  can prove every synthetic click landed on the right element.
- `driver.swift` — CGEvent gestures + CGWindowList measurement by owner
  PID. Usage: `swift driver.swift <app-pid>`; prints JSON.
- `run.sh` — starts `tinyjs dev` on this app, runs the driver, asserts
  the store keys AND the movement deltas, prints PASS/FAIL, exits
  non-zero on failure. Run it by hand: it needs a GUI session, so unlike
  the rest of `test/` it is not a `bin/tjs run` check.

Expected on a fixed launcher: `plain_dx` ≈ +200, `poison_dx` ≈ +240,
`nobtn_dx` = 0, `alive_dx` ≈ −120, all three store keys set → PASS.
On a pre-fix launcher `poison_dx` = 0 → FAIL (that is the point; A/B by
pointing `TINYJS_LAUNCHER` at the other binary).

Needs a logged-in GUI session and Accessibility permission for the
terminal running the driver (synthetic mouse events). Timings assume a
normally loaded machine; see the comment in `driver.swift` case B.

`dragOut` now shares the same press cache (`live_press()` in the
launcher) so it stops no-oping the same way, but it has no case here:
dropping real files needs a target application, so it stays a hand test
in TODO-verify.
