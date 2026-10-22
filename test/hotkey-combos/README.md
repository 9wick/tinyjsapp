# Hotkey combos: never a bare key

`native/combo.h` is the one combo parser all three launchers use for
hotkeys and keystrokes. The words, on any OS:

    c++ -std=c++17 native/combo_test.cc -o /tmp/ct && /tmp/ct   → PASS

The launcher wiring, per OS: `cd test/hotkey-combos/app && tinyjs dev`.
The backend registers `super+k` and `hyper+j`, sends `cmd+k` with
`app.keystroke` (needs Accessibility on macOS), stores the result and quits.

- `store.json` → `"hotkeytest"`: `registered` should be `{"sk": true, "bad": false}`
  on every OS (register() answers whether it worked). Except Windows,
  where `sk` is `false`, logged "the system refused it": the shell holds
  Win+K (Cast). That is the refusal path working.
- `store.json` → `"hotkeytest"`: `fired` should be `["sk"]` on macOS,
  where `super` means ⌘ (on Windows/Linux `cmd+k` is Ctrl+K and `super+k`
  is the Super key, so `fired` is `[]` there — that's expected).
- The console prints `tinyjs: hotkey "hyper+j" not registered: needs
  exactly one key plus modifiers` on every OS.
- The bug this guards: the old macOS launcher registered `super+k` as a
  bare K (`fired: []` on macOS, and K swallowed system-wide).
