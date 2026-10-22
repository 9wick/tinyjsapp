// c++ -std=c++17 native/combo_test.cc -o /tmp/combo_test && /tmp/combo_test
// The shared hotkey/keystroke combo parser (combo.h): modifiers in any
// order, exactly one key, and anything else refused — never a bare key.
#include "combo.h"
#include <cstdio>

static int fails = 0, runs = 0;
static void expect(const char *combo, bool ok, const char *key, bool primary,
                   bool ctrl, bool alt, bool shift, bool os_key) {
  runs++;
  Combo c = read_combo(combo);
  bool good = c.ok == ok && c.key == key && c.primary == primary && c.ctrl == ctrl &&
              c.alt == alt && c.shift == shift && c.os_key == os_key;
  if (!good) {
    fails++;
    std::printf("FAIL %-22s ok=%d key='%s' primary=%d ctrl=%d alt=%d shift=%d os_key=%d\n",
                combo, c.ok, c.key.c_str(), c.primary, c.ctrl, c.alt, c.shift, c.os_key);
  }
}

int main() {
  //                         ok     key     cmd    ctrl   alt    shift  os
  expect("cmd+shift+k",      true,  "k",    true,  false, false, true,  false);
  expect("super+k",          true,  "k",    false, false, false, false, true);   // was a bare K on macOS
  expect("win+k",            true,  "k",    false, false, false, false, true);
  expect("K+Shift+CMD",      true,  "k",    true,  false, false, true,  false);  // any order (Windows needed mods first)
  expect("ctrl+alt+f12",     true,  "f12",  false, true,  true,  false, false);
  expect("option+space",     true,  "space", false, false, true, false, false);
  expect("meta+command+k",   true,  "k",    true,  false, false, false, false);  // aliases, repeated
  expect("k",                true,  "k",    false, false, false, false, false);  // bare key on purpose: allowed
  expect("hyper+k",          false, "",     false, false, false, false, false);  // unknown modifier: was a bare K on Linux
  expect("a+b",              false, "",     false, false, false, false, false);  // two keys: was the last one
  expect("cmd+shift",        false, "",     true,  false, false, true,  false);  // no key
  expect("",                 false, "",     false, false, false, false, false);
  expect("cmd++",            false, "",     true,  false, false, false, false);  // empty token
  expect("cmd+",             false, "",     true,  false, false, false, false);
  expect("+k",               false, "",     false, false, false, false, false);
  // key names come out in one spelling (canonical_key)
  expect("cmd+enter",        true,  "return", true, false, false, false, false);
  expect("esc",              true,  "escape", false, false, false, false, false);
  expect("delete",           true,  "backspace", false, false, false, false, false);
  expect("forwarddelete",    true,  "forwarddelete", false, false, false, false, false);
  expect("cmd+-",            true,  "minus", true,  false, false, false, false);
  expect("cmd+,",            true,  "comma", true,  false, false, false, false);
  expect("ctrl+/",           true,  "slash", false, true,  false, false, false);
  expect("cmd+'",            true,  "quote", true,  false, false, false, false);
  expect("cmd+apostrophe",   true,  "quote", true,  false, false, false, false);
  expect("alt+[",            true,  "bracketleft", false, false, true, false, false);
  // No positional %2$d: MinGW's printf prints it literally.
  if (fails) std::printf("%d of %d FAILED\n", fails, runs);
  else std::printf("PASS %d cases\n", runs);
  return fails ? 1 : 0;
}
