---
nav: Windows
description: Install tinymist on Windows with winget or the standalone installer, so Texpile can compile Typst documents.
blurb: winget, or the standalone installer.
icon: windows
order: 1
---

# Typst on Windows

Either route is one command.

## With winget

winget is already on Windows 10 and 11, so this is the shortest route:

```powershell
winget install Myriad-Dreamin.Tinymist
```

> [!NOTE]
> Use this exact id. The same publisher also ships Myriad-Dreamin.TinymistViewer and Myriad-Dreamin.TinymistDocsTool, which are different programs and compile nothing.

## Without a package manager

The project publishes a standalone installer with each release. It puts tinymist in `%USERPROFILE%\.local\bin` and adds that directory to your account's PATH:

```powershell
powershell -c "irm https://github.com/Myriad-Dreamin/tinymist/releases/latest/download/tinymist-installer.ps1 | iex"
```

> [!NOTE]
> This downloads a script from the tinymist project's releases and runs it immediately. Texpile does not control that script or that release. Open the URL in a browser and read it first if you would rather check what it does.

> [!NOTE]
> A Command Prompt that was already open will not see the new PATH until you close and reopen it. Texpile only looks for programs when it starts, so restart Texpile too.

[Checking the install](README.md)
