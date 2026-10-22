---
title: "assets"
---

# assets

<p class="tagline">files the OS reads</p>

`assets/` holds the files the operating system reads, each by its name. Nothing else in it ships — the build notes any file it doesn't use. Files your own code reads go in [resources](./resources).

```text
myapp/
  assets/
    icon.png        # the app icon, every OS
    Credits.html    # macOS About panel credits (or Credits.rtf / .rtfd)
    My App Help/    # macOS help book
```

Projects made before 0.53 keep `icon.png` and `Credits.html` at the project root; both are still found there.

## icon {#icon}

A 1024×1024 PNG. Point [`icon`](./config#icon) somewhere else to use another file.

- **macOS**: turned into `AppIcon.icns` for the app, and shown in the Dock during `tinyjs dev`.
- **Windows**: stamped into `<name>.exe` and `launcher.exe`.
- **Linux**: shipped as `icon.png` beside the app, and used for its desktop entry.

## credits (macOS) {#credits}

`Credits.html` (or `.rtf`, `.rtfd`) fills the standard About panel, with working links, in place of the one-line [`attribution`](./config#attribution). Start an HTML file with `<meta charset="utf-8">` and set a font, or AppKit reads it as Latin-1 and sets it in Times.

## help book (macOS) {#help-book}

A folder of HTML pages with its own `Contents/Info.plist`, shown by Help Viewer — see [Apple's guide](https://developer.apple.com/library/archive/documentation/Carbon/Conceptual/ProvidingUserAssitAppleHelp/authoring_help/authoring_help_book.html). Name the folder with [`helpBook`](./config#helpBook):

```json
{ "macos": { "helpBook": "My App Help" } }
```

The build copies it into the app, registers it by its own `CFBundleIdentifier`, and rebuilds its search index with `hiutil`. The app's Help menu then has "&lt;App&gt; Help" (⌘?) and a search field that searches the book — no code needed; add your own items with a `{ role: 'help' }` [menu](./menus).

It works in built apps only (in `tinyjs dev` there's no app bundle for Help Viewer to find). Help Viewer caches books by version, so bump [`version`](./config#version) to see an edited book.
