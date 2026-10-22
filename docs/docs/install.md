---
title: "install"
---

# install

<p class="tagline">one line, no dependencies</p>

::: tabs
== macOS
```sh
curl -fsSL https://tinyjs.app/install | sh
```

macOS 15+ · Apple silicon + Intel · MIT

== Windows
```powershell
irm https://tinyjs.app/install.ps1 | iex
```

Windows 10/11 · x86_64 + arm64 · prebuilt, no compiler needed · just the WebView2 runtime (preinstalled on Windows 11) · adds tinyjs to your PATH (open a new terminal) · MIT

== Linux
```sh
curl -fsSL https://tinyjs.app/install | sh
```

x86_64 + arm64 · same script as macOS, detects Linux · glibc 2.35+ (Ubuntu 22.04 / Debian 12 and newer) · needs libwebkit2gtk-4.1-0 (`sudo apt install libwebkit2gtk-4.1-0` · `sudo zypper install libwebkit2gtk-4_1-0`) · MIT
:::

Then `tinyjs new myapp && cd myapp && tinyjs dev` — a window opens with hot reload. The CLI updates itself with `tinyjs update`.
