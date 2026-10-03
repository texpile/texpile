---
nav: Typst
description: Install tinymist so Texpile can compile Typst, in one click from inside Texpile, or yourself with winget on Windows, Homebrew on macOS, and the installer script on Linux.
blurb: One program, tinymist. Texpile can install it for you.
icon: type
order: 2
---

# Typst

Typst needs one program, tinymist. It compiles the document and provides completion, hover, and the errors shown as you type. You do not need to install typst as well.

## From Texpile

The easiest route, on Windows, macOS, and Linux alike. Wherever Texpile finds no tinymist, it offers Install tinymist:

| Where to find it | Path                                                | Note                                                   |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Preferences      | Preferences › Toolchain, under Typst                | Also where to reinstall or remove it.                  |
| Typst file       | The line over the editor: tinymist is not installed | When a .typ file is open.                              |
| Typst preview    | Set Up Typst, in the preview pane                   | When the preview has nothing to run it.                |
| Dialog           | Texpile cannot find tinymist                        | When a compile, export, format, or template needed it. |

Texpile downloads the tinymist release it is tested with from dl.texpile.com, where the Windows and macOS programs are signed by Texpile. It checks the download against the checksum Texpile expects and keeps it in its own data folder. It works straight away: no restart, and open Typst files pick it up. Nothing is downloaded until you click Install tinymist.

A tinymist you installed yourself, on your PATH or in a folder listed under Preferences › Toolchain, comes first. To use Texpile's copy anyway, pick it as the Typst distribution in Preferences › Toolchain. That page also says which one is in use.

## Installing it yourself

To manage the version yourself, or to use tinymist outside Texpile too:

- [Windows](windows.md)
- [macOS](macos.md)
- [Linux](linux.md)

> [!NOTE]
> tinymist is a separate project. Every command on these pages installs from that project's own releases or from a third-party package repository, none of which Texpile controls. Check that a command and where it points look right to you before running it.

## Check it worked

Preferences › Toolchain lists tinymist with its version, the Typst version it compiles with, and where it came from. For a tinymist you installed yourself, this prints the same two versions:

```bash
tinymist --version
```

> [!NOTE]
> The routes on the pages above put tinymist on your PATH, and Texpile only looks for programs when it starts. So a terminal or a copy of Texpile that was already open will not see it until you close and reopen it. Texpile's own copy needs no restart.

[Back to installation](../README.md)
[Compiling, in full](../../latex/compiling.md)
