---
nav: Typst
description: Install tinymist so Texpile can compile Typst: winget on Windows, Homebrew on macOS, and the installer script on Linux.
blurb: One program, tinymist.
icon: type
order: 2
---

# Typst

Typst needs one program, tinymist. It compiles the document and provides completion, hover, and the errors shown as you type. You do not need to install typst as well.

- [Windows](windows.md)
- [macOS](macos.md)
- [Linux](linux.md)

> [!NOTE]
> tinymist is a separate project. Every command on these pages installs from that project's own releases or from a third-party package repository, none of which Texpile controls. Check that a command and where it points look right to you before running it.

## Check it worked

This prints tinymist's own version and the Typst version it compiles with:

```bash
tinymist --version
```

> [!NOTE]
> Every route puts tinymist on your PATH, and Texpile only looks for programs when it starts. So a terminal or a copy of Texpile that was already open will not see it until you close and reopen it. Preferences › Toolchain lists every program Texpile runs and whether it was found.

[Back to installation](../README.md)
[Compiling, in full](../../latex/compiling.md)
