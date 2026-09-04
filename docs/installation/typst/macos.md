---
nav: macOS
description: Install tinymist on macOS with Homebrew or the standalone installer, so Texpile can compile Typst documents.
blurb: Homebrew, or the standalone installer.
icon: apple
order: 2
---

# Typst on macOS

One command either way.

## With Homebrew

Works on Apple silicon and recent Intel macOS:

```bash
brew install tinymist
```

## Without Homebrew

The project publishes a standalone installer with each release. It puts tinymist in `~/.local/bin` and adds that directory to your PATH in your shell's init file:

```bash
curl -LsSf https://github.com/Myriad-Dreamin/tinymist/releases/latest/download/tinymist-installer.sh | sh
```

> [!NOTE]
> This downloads a script from the tinymist project's releases and runs it immediately. Texpile does not control that script or that release. Open the URL in a browser and read it first if you would rather check what it does.

> [!NOTE]
> A Terminal that was already open will not see the new PATH until you open a new window. Texpile only looks for programs when it starts, so quit and reopen Texpile too.

[Checking the install](README.md)
