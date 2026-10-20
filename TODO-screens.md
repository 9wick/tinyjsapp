# Multi-screen — coordinates, screen identity, remembered placement

Started from #70 (2026-10-15, @lionel-rowe): moving a window to a screen with
a different scale factor needed a `* scale` fudge on Windows. Planned
2026-10-19. Phases are ordered by dependency — each one assumes the previous
is in.

## Status (2026-10-20, branch `feat/screens-70`)

All four phases are built on all three launchers. macOS is tested, with a
1x virtual display beside the 2x panel (`test/screens/vdisplay.m`). Windows
is tested (2026-10-20, arm64 VM with two monitors at 100/125/150/200% in
right/left/above layouts); only uid across a reboot / port move is still
open. Linux compiles in an Ubuntu 22.04 container but hasn't run yet. The
per-OS boxes are in TODO-verify.md under #70.

Found and fixed during the Windows run:
- A window moved FROM a higher-scale screen to straddle a lower-scale one
  kept its old physical size, so Windows never rescaled it and it read back
  through the wrong monitor. `match_monitor_dpi` hops it onto the target's
  DPI first (`pos` and `spos`).
- With rememberWindows, main flashed at the default spot (~20ms) because
  the vendored `webview_set_size` shows the window before the defer hide.
  Main now starts DWM-cloaked when it will start hidden.
- One 116x0 placement got saved after a monitor removal (not reproduced).
  The bridge now never saves or restores an empty content box.
- Size across a scale change: secondaries kept their physical size
  (secwin_proc had no WM_DPICHANGED; 600x400 DIP opened on 150% came out
  596x389, AdjustWindowRect used the system DPI), and main lost its menu
  bar's height per crossing (the vendored handler sums the frame without
  the menu: Tiny Deck 720 → 700 → 680). Both now fit the client to
  old size × new/old DPI after the change. A window narrower than its own
  menu bar still drifts, because the bar wraps differently per DPI.
- Not #70, found testing amp: the launcher crashed on quit (0xC0000005)
  whenever the bridge was still sending EVALs (amp's satellites push
  window-state as main closes). Queued dispatches ran on the
  half-destroyed engine, and the pipe thread could post to it. tiny_dispatch
  now stops both once webview_run returns. Pre-existing; 0.58.1 made it
  visible by passing the exit status on.
- Open, for apps: WebView2's own screen model disagrees with ours on mixed
  DPI. On a 150% screen at x 3456, `screen.availLeft` reads 2304 (physical
  / own scale) while `window.screenX` reads our space and goes stale after
  a programmatic move. An app dragging by `e.screenX` deltas (amp's
  drag.js) may jump at the boundary with a real mouse. CDP-synthesized
  drags can't show it; needs a hand drag on mixed DPI. If it jumps, drag
  by `clientX` deltas against getState() instead.
- Not fixed: re-adding a monitor sends two WM_DISPLAYCHANGE ~930ms apart,
  past the 500ms debounce, so `screens-changed` fires twice with the same
  list. A bridge-side "same list as last time" skip would collapse it.

Where the build differs from the sketch below:
- The window-state field is **`screenId`**, not `screen`: `getState().screen`
  was already `{ width, height, scale }`, and replacing it would have broken
  callers. `onState` events carry `screenId` too, and they fire when a
  window changes screen. That replaces a separate `screen-changed` event.
- Screens keep `name` (it already existed) rather than gaining `label`.
- `id` stays numeric (captureScreen/recording take it), and `uid` was added
  beside it (phase 3's "decide at implementation").
- Screen changes: page `tiny.app.onScreensChanged(fn)` / the
  `'screens-changed'` event (it carries the fresh list); backend
  `onSystem('screens')`.
- rememberWindows records the window's last placement, whoever moved it.
  "User-driven moves only" isn't separated out: there's no reliable signal
  for it on X11, and the app's own last placement is usually what it wants
  restored anyway.
- `pxsize` and `fsscreen` are new wire ops beside `spos`; `GET fgscreen`
  answers with a screen id (the bridge resolves it); `WINGEOM <win>` is sent
  only after `WINOP geom 1`.

## The finding: Windows has no single coordinate space

Every Windows getter/setter converts physical px → logical by dividing, but
each picks a DIFFERENT scale:

| API | divides by | where |
| --- | --- | --- |
| `os.screens()` | that monitor's own scale | `screens_json()` in launcher-win.cc |
| `win.setPosition` | the window's CURRENT monitor's scale | `starts("pos ")` in `do_winop` |
| `win.get()` x/y | the window's scale | `win_state_json()` |
| `os.mouse()` | the cursor's monitor's scale | `do_get`, `what == "mouse"` |

Lionel's setup: 1920-wide 1.0 external on the left, 1.25 laptop on the right.
The laptop's physical origin is x=1920; `screens()` divides by its own 1.25 and
reports **1536** — a point INSIDE the external monitor. His `x * scale`
turned it back into physical 1920, then `setPosition` multiplied by the
window's current scale (1.0, it was on the external) → 1920 physical. Correct
by coincidence: run the same code from the laptop screen and it's wrong.
Single-monitor and all-same-scale setups never see any of this.

macOS is fine (its global space is points natively; we pass them through).
X11 is one global pixel space with one scale. Wayland has no global positions.

**Lionel's workaround breaks when phase 1 lands** — say so on #70 and in the
changelog.

## What everyone else does (researched 2026-10-19)

- **Electron / Chromium** — one global DIP space. On Windows Chromium builds it
  with a tree layout rooted at the primary monitor (`ScreenWin`,
  `docs/ui/display/display_conversion.md`), so neighbours keep physical
  adjacency (the 1.25 laptop sits at DIP x=1920). Known limit: a scaled-down
  screen can lack room for its children, so one DIP point can map to two
  physical points — first found wins. Electron still ships Windows-only
  `screenToDipPoint` / `dipToScreenPoint` / `…Rect` escape hatches. API worth
  copying: `getDisplayNearestPoint`, `getDisplayMatching(rect)`,
  `display-added/-removed/-metrics-changed`.
- **Web Window Management API** (`getScreenDetails()`) — inherits Chromium's
  DIP layout. `ScreenDetailed`: `left/top/availLeft/availTop`, `isPrimary`,
  `isInternal`, `label`, `devicePixelRatio`; events `screenschange` +
  `currentscreenchange`; `requestFullscreen({ screen })`. Its open issues
  (w3c/window-management) are mostly sandbox concerns (permission prompt,
  fingerprinting, label privacy) that don't apply to us. The relevant ones:
  #94 should moveTo clamp per screen, #92 fullscreen on multiple screens, #84
  content-area vs frame coords, #80 object identity across calls.
- **Tauri / tao** — physical positions for monitors, `Physical|Logical`
  positions for windows (logical converted with the WINDOW's scale → same
  ambiguity as us). tauri#7890 (open since 2023): units mixed on macOS,
  windows jump screens, restores land on the wrong monitor; identical
  monitors get the same id. A July 2026 fix series (tao#1272, tray-icon#343,
  plugins-workspace#3502) was closed unmerged by its author 2026-08-21 with no
  maintainer review. Its lessons apply to us anyway:
  - convert a target with the scale of the monitor it LANDS ON, not the one
    the window is leaving (exactly our Windows setPosition bug);
  - convert the cursor with ITS monitor's scale (Qt `QCursor::setPos` and
    JDK-8190326 had the primary-scale version of this bug too);
  - any placement math that crosses a scale boundary must use the window's
    size AT THE DESTINATION scale (their tray positioner overflowed a 2x
    screen with a size measured on 1x);
  - the validation: `set_position(outer_position())` round-trips on every
    monitor.
- **Avalonia** — `Screens.All/Primary`, `ScreenFromWindow`, `ScreenFromPoint`,
  `ScreenFromBounds`, a `Changed` event. Best helper set of the lot.
- **SDL3** — native units (pixels on Windows, points on macOS); docs just say
  test both. **GLFW** — virtual screen coords + per-monitor content scale.
  **Qt** — `QScreen`, long history of mixed-DPI gap/overlap bugs on Windows.
  **Flutter** — no stable multi-window/monitor API yet. **Neutralino** —
  `getDisplays()` with resolution/dpi only.
- **Wayland** — compositors refuse global coordinates. The compromise is the
  experimental zones protocol (merged as `xx-zones`, Feb 2026): a per-client
  coordinate space attached to one output. Restore-position goes through the
  session-management protocol instead. `xdg_toplevel.set_fullscreen(output)`
  works TODAY (GTK: `gtk_window_fullscreen_on_monitor`).
- **Nobody** offers "screen of the focused window of ANY app"; everyone
  approximates with the screen under the cursor (we have `os.mouse().screen`).

Takeaway: copy the web API's object model and events; don't promise a global
pixel space; make screen-relative the primary shape because it's
well-defined everywhere and is where Wayland is heading.

## Phase 1 — fix the Windows global space (bug, patch release)

Build one Chromium-style DIP layout over `EnumDisplayMonitors` (tree from the
primary, each child placed by its physical adjacency, divided by its own
scale) and route ALL conversions through one pair of helpers:

```cc
POINT dip_to_px(double x, double y);   // picks the target monitor in DIP space
DPOINT px_to_dip(POINT p);             // picks the monitor containing p
```

Call sites: `screens_json`, `win_state_json`, `do_get` mouse, `WINOP pos`,
`win.open` x/y, `do_center`, `rescue_offscreen`, tray rect (`traypos`),
other-app windows (`os.windows()` / `moveWindow`), drag paths that call
`GetCursorPos`. Grep for `window_scale(` and `monitor_scale(` — every hit is a
candidate.

- Overlap points: first-found wins, as Chromium. Document it, don't fix it.
- Window size: the CLIENT size stays in the window's own scale (that's what
  WebView2 renders at); only positions move through the layout.
- Done when the round-trip test below passes on 1.0 + 1.25 (and ideally
  1.0 + 1.5 with the scaled screen on the LEFT and ABOVE).

## Phase 2 — screen-relative placement and the object model

Three coordinate spaces, each only where it's well-defined:

| space | units | how | for |
| --- | --- | --- | --- |
| global logical | points / DIP | default — today's API, unchanged | most apps |
| screen-local logical | points from the screen's top-left | `{ screen }` | "top-left of screen 2", restore |
| screen-local pixels | physical px from the screen's top-left | `{ screen, units: 'px' }` | pixel-exact work |

No global PIXEL space: macOS has none (points × per-screen scale overlaps —
that's tauri#7890), Wayland has no globals at all. Windows has a real one
(virtual-desktop px); allow `units: 'px'` without `screen` there only, and
don't advertise it.

Who needs pixels: fractional scales (at 1.25 logical units can't address every
pixel — edge-to-edge snapping gaps/overlaps by 1px), mapping `os.screenshot`
PNG coords back to positions, Win32 FFI values (Lionel's
`GetMonitorInfoW` rects are physical), overlays/automation lining up with
other apps.

API sketch:

```ts
win.setPosition(x, y)                                // global logical
win.setPosition(x, y, { screen: id })                // screen-local logical
win.setPosition(x, y, { screen: id, units: 'px' })   // screen-local px
win.setSize(w, h, { units: 'px' })                   // on the window's screen
win.setFullscreen(true, { screen: id })              // works on Wayland too
win.open(id, { screen, x, y, ... })                  // same options at creation

win.get(): {
  ...,
  screen: id,                       // screen holding most of the window
  local: { x, y },                  // logical, relative to that screen
  pixels: { x, y, width, height },  // local px
}

TinyScreen: {
  id, label, x, y, width, height, visible, scale, primary,
  internal: boolean,                // built-in panel
  pixels: { width, height, visible: { x, y, width, height } },
}

tiny.os.screenAt(x, y): TinyScreen | null          // Avalonia/Electron helpers
tiny.os.screenFor(rect): TinyScreen | null
tiny.os.foregroundScreen(): TinyScreen | null       // focused window of ANY app
events: 'screens-changed' (plug/unplug/resolution/scale/arrangement),
        window 'screen-changed' (moved onto another screen)
```

"Which screen a window is on" = most of its area (`MonitorFromWindow`,
`NSWindow.screen`, `gdk_display_get_monitor_at_window`).

`foregroundScreen()` per platform: Windows `GetForegroundWindow` →
`MonitorFromWindow`; macOS `NSWorkspace.frontmostApplication` pid → its first
layer-0 entry in `CGWindowListCopyWindowInfo` (front-to-back order) →
`NSScreen` containing most of `kCGWindowBounds` — **no permission needed**
(measured, see research notes); X11 `_NET_ACTIVE_WINDOW`; Wayland `null`.
A frontmost app with no windows (Finder on the desktop) → fall back to the
cursor's screen.

Wayland: `setPosition` in any space stays a no-op (as today);
`setFullscreen(true, { screen })` is the one placement op that works.

Every launcher gets ONE conversion helper taking the screen explicitly — no
call site picks a scale on its own (that's how phase 1's bug happened).

## Phase 3 — stable screen ids

Today: macOS `CGDirectDisplayID` (stable only until reboot), Windows and Linux
**enumeration indices** (shuffle on reconnect). Nothing can "remember the
screen" with these.

- macOS: `CGDisplayCreateUUIDFromDisplayID` (what winit and Zed use).
- Windows: `QueryDisplayConfig` → `DisplayConfigGetDeviceInfo`
  (`DISPLAYCONFIG_TARGET_DEVICE_NAME`): `monitorDevicePath` (+
  `connectorInstance` to split identical models on one adapter) for `uid`,
  `monitorFriendlyDeviceName` for `label` instead of `\\.\DISPLAY1`. Don't
  copy Chromium's id (hash of adapter LUID + target id): a LUID is only
  locally unique, so expect it to change across reboots. Unverified: whether
  `monitorDevicePath` changes when a monitor moves ports — test on hardware.
- Linux: connector name (`DP-1`) via the deprecated-but-present GTK3
  `gdk_screen_get_monitor_plug_name()`. On X11 that's the XRandR output name;
  on Wayland GTK 3.24 fills it from `xdg_output.name` (gtk MR !951). Pair it
  with `gdk_monitor_get_manufacturer/model` so a monitor moved to another
  port still scores in phase 4's matcher. Verify on GNOME + KDE Wayland.

`id` vs `uid`: keep `id: number` as the per-session handle (it already feeds
`captureScreen(screenId)` and `recording.start({ screenId })` — changing its
type breaks both) and ADD `uid: string` for persistence. Electron does the
same split in spirit: `display.id` is a number and only session-stable.

Document that ids still aren't perfect: identical monitors often share
EDID-derived ids, DisplayLink/virtual displays get a new id per connect.

## Phase 4 — remembered placement (opt-in)

No built-in window-state persistence exists today (apps roll their own via
`tiny.store`). Add it as an opt-in tinyjs.json key (e.g. `"rememberWindows":
true` — add to docs/schema/tinyjs.schema.json), stored in
`window-state.json` beside `store.json`.

Model it on what the OSes do for their own windows (Windows keys window
positions per connected-monitor set; macOS per display arrangement):
**remember per screen LAYOUT**, so docked and laptop-only each restore their
own arrangement.

- Layout key: fingerprint of the connected set (sorted uids + sizes + scales).
- Per layout, per window: screen snapshot (uid, label, size, scale, position
  in the layout, primary, internal), rect relative to that screen's WORK
  AREA, normal bounds even when maximised, state
  (normal/maximised/fullscreen).
- Keep the last ~5–10 layouts; drop the oldest.

Matching when the uid doesn't resolve — score each connected screen:

| signal | weight |
| --- | --- |
| stable uid | decisive |
| label + resolution + scale | high (fails only for identical monitors) |
| internal panel | high |
| position in the layout ("left of the laptop") | medium — the ONLY tiebreak for identical monitors |
| was primary | low (users change it) |

Below threshold → screen under the cursor (or primary), same relative
position, logical size clamped to fit. Matched screen with a new
resolution/scale → keep logical size, clamp position. Then always the
existing `rescue_offscreen` pass. Wayland: restore size + fullscreen-on-output
only.

Also expose the matcher (`tiny.os.matchScreen(saved)`) for apps that persist
their own state.

Pitfalls (`electron-window-state` complaints): don't save mid-drag (debounce;
save on close/quit), keep normal bounds of a maximised window, record
user-driven moves rather than the app's own `setPosition` calls.

Cable-swapped identical monitors will guess wrong. So does every OS.

## Testing

Add to `test/appsurface.html`: for every screen, in all three spaces, set a
position → read it back → must match (±1px for rounding at fractional scales).
Plus: `screenAt(center of each screen)` returns that screen; `get().screen`
follows a move across screens.

Rigs needed — per CLAUDE.md, tick TODO-verify.md only after watching it run:

- Windows mixed DPI: 1.0 + 1.25, and a scaled screen left/above the primary.
- macOS: 1x + 2x (non-Retina external + built-in).
- Linux X11 two screens; Wayland for the fullscreen-on-output path.
- Hot-plug during a run → `screens-changed` fires, ids stable (phase 3).

## Research notes (2026-10-19)

**macOS: window bounds need no Screen Recording permission — MEASURED** on
macOS 27.0.1. A test binary run from iTerm (which holds the grant) and the same
binary wrapped in its own unsigned `.app` launched via `open` (preflight
`false`): both get other apps' `kCGWindowBounds` and `kCGWindowOwnerName`;
without the grant only `kCGWindowName` (titles) is nil. Matches Apple DTS
("calls go through, private info stripped") and Chromium, which uses
title-visibility as its permission probe. Caveat: a developer forum thread
saw owner names nil on Tahoe — don't rely on owner name; use the pid.

**Linux `scale` is an integer and can't be trusted under fractional
scaling.** GTK3 ignores `wp_fractional_scale_v1` and reads the integer
`wl_output.scale`; the compositor advertises a rounded value and downscales
the surface. Rounding direction differs: GNOME rounds UP (225% → 3), KDE
reported 2 at 170%. Monitor GEOMETRY is right (GTK 3.24 uses xdg-output
logical sizes), only the scale lies. Consequences:
- Document `scale` on Linux as "integer buffer scale, not the user's
  setting".
- `pixels` on Linux = logical × that integer, i.e. the BUFFER pixels GTK
  renders at, not the panel's pixels. Under fractional Wayland "pixel-exact"
  doesn't exist for a GTK3 client; say so instead of faking it. X11 with
  integer `GDK_SCALE` is exact.
- Possible true value: xdg-output logical size vs `wl_output` mode size
  gives the real ratio (1.25) — only if someone asks for it.
- Still to measure: what WebKitGTK's `devicePixelRatio` reports in the same
  setup (nothing found online).

**Clamping (web #94): don't clamp.** The spec lets implementations deny or
adjust `moveTo` and Chrome clamps to a single screen's work area — a
browser-sandbox policy against hostile pages. The issue closed with spanning
deferred to a permission. Our callers are the app itself, and spanning
windows (video walls, a wide canvas across two screens) is a legit use. Keep
`setPosition` literal; `ensureOnScreen` and `offscreenRescue` already cover
"don't lose the window".

Still unverified, needs hardware: Windows `monitorDevicePath` across a
reboot and a port move (identical monitors DO differ, by the PnP instance:
`…&UID0#…` vs `…&UID1#…`); Linux plug names on KDE Wayland;
`foregroundScreen` on X11 under GNOME vs KDE.
