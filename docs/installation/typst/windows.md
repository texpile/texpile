---
nav: Windows
description: Install tinymist on Windows with winget or the standalone installer, so Texpile can compile Typst documents.
blurb: winget, or the standalone installer.
icon: windows
order: 1
---

# Typst on Windows

Install tinymist with winget:

```powershell
winget install Myriad-Dreamin.Tinymist
```

Without winget, use the installer script:

```powershell
powershell -c "irm https://github.com/Myriad-Dreamin/tinymist/releases/latest/download/tinymist-installer.ps1 | iex"
```

Restart Texpile if it is open.
