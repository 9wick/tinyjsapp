// Shared parsing for global hotkeys and synthetic keystrokes: "cmd+shift+k".
// Included by all three launchers; tested by native/combo_test.cc.
//
// The launchers used to parse combos three different ways, and each could
// turn a combo it didn't fully understand into a BARE KEY — a system-wide
// hotkey on "k" that swallowed every K typed anywhere:
//   macOS   "super"/"win" weren't modifiers, so "super+k" registered K.
//   Linux   any unknown word became the key, then the real key overwrote it.
//   Windows modifiers had to come first, and "a+b" kept the last key.
// Now there's one rule everywhere: modifiers in any order, exactly one key,
// and anything else is refused (ok == false) rather than guessed at.
//
// Modifier names, and what each platform maps them to:
//   cmd command meta  -> Cmd on macOS, Ctrl on Windows and Linux
//   ctrl control      -> Control on macOS, Ctrl on Windows and Linux
//   alt opt option    -> Option / Alt
//   shift             -> Shift
//   win super         -> the Windows / Super key; Cmd on macOS, which has
//                        no separate OS key (its menus already read it so)
// The key comes out lowercased and in ONE spelling (canonical_key below), so
// every launcher's key table answers to the same names:
//   a–z 0–9 f1–f24 space tab return escape up down left right home end
//   pageup pagedown backspace forwarddelete minus equal comma period slash
//   semicolon quote backslash grave bracketleft bracketright
// with aliases folded in: enter, esc, delete (= backspace, as macOS and Linux
// always read it; forwarddelete is the other one), and punctuation typed as
// itself ('-', ',', '/'…). Each launcher used to know a different subset.
#pragma once

#include <string>

inline std::string canonical_key(const std::string &k) {
  if (k.size() == 1) {
    switch (k[0]) {
      case '-': return "minus";      case '=': return "equal";
      case ',': return "comma";      case '.': return "period";
      case '/': return "slash";      case ';': return "semicolon";
      case '\'': return "quote";    case '\\': return "backslash";
      case '`': return "grave";      case '[': return "bracketleft";
      case ']': return "bracketright";
      default: return k;
    }
  }
  if (k == "enter") return "return";
  if (k == "esc") return "escape";
  if (k == "delete" || k == "del") return "backspace";
  if (k == "apostrophe") return "quote";
  if (k == "equals") return "equal";
  if (k == "backtick") return "grave";
  if (k == "pgup") return "pageup";
  if (k == "pgdn") return "pagedown";
  return k;
}

struct Combo {
  bool primary = false;  // cmd / command / meta
  bool ctrl = false;     // ctrl / control
  bool alt = false;      // alt / opt / option
  bool shift = false;    // shift
  bool os_key = false;   // win / super (named so: `super` means something in Objective-C++)
  std::string key;       // the one non-modifier token, lowercased
  bool ok = false;       // exactly one key, every other token a modifier
};

inline Combo read_combo(const std::string &combo) {
  Combo c;
  int keys = 0;
  bool empty_token = false;
  size_t start = 0;
  for (;;) {
    size_t plus = combo.find('+', start);
    std::string t = combo.substr(start, plus == std::string::npos ? std::string::npos : plus - start);
    for (auto &ch : t) ch = (char)((ch >= 'A' && ch <= 'Z') ? ch - 'A' + 'a' : ch);
    if (t.empty()) empty_token = true;
    else if (t == "cmd" || t == "command" || t == "meta") c.primary = true;
    else if (t == "ctrl" || t == "control") c.ctrl = true;
    else if (t == "alt" || t == "opt" || t == "option") c.alt = true;
    else if (t == "shift") c.shift = true;
    else if (t == "win" || t == "super") c.os_key = true;
    else { c.key = canonical_key(t); keys++; }
    if (plus == std::string::npos) break;
    start = plus + 1;
  }
  c.ok = keys == 1 && !empty_token;
  if (!c.ok) c.key.clear();
  return c;
}
