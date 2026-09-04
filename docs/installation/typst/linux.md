---
nav: Linux
description: Install tinymist on Linux with the installer script or Homebrew, so Texpile can compile Typst documents.
blurb: The installer script, or Homebrew.
icon: linux
order: 3
---

# Typst on Linux

No distribution packages tinymist, so the installer script is the usual route here.

## With the installer script

Published with each release. It installs into `~/.local/bin` and adds that directory to your PATH in your shell's init file:

```bash
curl -LsSf https://github.com/Myriad-Dreamin/tinymist/releases/latest/download/tinymist-installer.sh | sh
```

> [!NOTE]
> This downloads a script from the tinymist project's releases and runs it immediately. Texpile does not control that script or that release. Open the URL in a browser and read it first if you would rather check what it does.

> [!NOTE]
> The script edits your shell's init file, so a terminal that was already open will not see tinymist. Texpile only looks for programs when it starts, so restart Texpile as well.

## With Homebrew

Homebrew runs on Linux too:

```bash
brew install tinymist
```

[Checking the install](README.md)
