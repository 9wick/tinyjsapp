---
title: "Introduction"
---

# Introduction

Everything a tinyjs app can do. Frontend calls live under `window.tiny`; the backend gets the same calls on its `app` handle, by the same names — the [API map](./api-map) lists every one side by side.

tinyjs makes desktop apps for macOS, Windows and Linux. Where an OS can't do something, the call says so in these docs and rejects or answers `'unsupported'` at runtime, so cross-platform code can feature-detect — see [portability](./portability).

Phones aren't on the roadmap. If you need iOS or Android, [Tauri](https://tauri.app) is a good fit.

Start with [install](./install).
