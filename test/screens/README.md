# Multi-screen probe (#70)

Drives the screen APIs from the backend: every screen through the three
coordinate spaces (global points, screen-local points, screen-local pixels),
`set(get())` per case, `screenAt` / `screenFor`, `foregroundScreen`,
`matchScreen`, `win.open({ screen })`, `setFullscreen(true, { screen })` and
`setSize({ units: 'px' })`. The app has `"rememberWindows": true`, so the
probe's last step leaves a known placement for the restore phase.

```sh
cd test/screens/app
SCREENS_OUT=/abs/out.json tinyjs dev                       # probe; quits itself
SCREENS_PHASE=restore SCREENS_OUT=/abs/r.json tinyjs dev   # after the probe
SCREENS_PHASE=watch SCREENS_WATCH_MS=15000 SCREENS_OUT=/abs/w.json tinyjs dev
```

- **probe**: `ok: true` and `fails: []`. `roundTrip` lists each screen ×
  case. `pxSize` is exact on a 1x screen; macOS snaps window frames to whole
  points, so on 2x expect the next even pixel.
- **restore**: `screenId` / `local` / `size` match the probe's `leftAt`
  (the window comes back on the same screen, same spot, 500x350). Delete
  `window-state.json` in the app's data dir to start clean.
- **watch**: plug/unplug a display during the window. `sysEvents` (backend
  `onSystem('screens')`) and `pageSeen` (page `onScreensChanged`, the screen
  ids each time) should each get one entry per change.

One screen proves little. On a one-screen Mac, `vdisplay.m` here fakes a
second one (CGVirtualDisplay, private API — build line at its top); run it
before the probe, or plug/unplug it by starting/killing it during `watch`.
