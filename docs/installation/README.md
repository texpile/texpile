---
nav: Installation
description: Install Texpile on Windows, macOS, or Linux, then a TeX distribution for LaTeX or tinymist for Typst, and git for version control.
blurb: Install Texpile, then a compiler for the format you write in.
icon: hard-drive-download
order: 1
section: Get started
---

# Installation

Install Texpile first, then a compiler for the format you write in. Editing works as soon as Texpile opens. Producing a PDF needs the second install.

## 1. Install Texpile

### Windows

Download the installer and run it. Texpile appears in the Start menu when it finishes.

### macOS

Open the .dmg and drag Texpile to your Applications folder.

### Linux

On Debian, Ubuntu, and their derivatives, install the .deb with apt rather than dpkg, so the packages it depends on are installed with it. The leading `./` matters. Without it, apt looks for a package by that name in your repositories instead of reading the local file.

```bash
wget https://dl.texpile.com/latest/deb -O texpile.deb
sudo apt install ./texpile.deb
```

Everywhere else, the AppImage runs on most distributions without installing anything. Make it executable and run it:

```bash
wget https://dl.texpile.com/latest/linux -O Texpile.AppImage
chmod +x Texpile.AppImage
./Texpile.AppImage
```

AppImages need FUSE 2, which recent distributions no longer install by default. If it exits with a message about libfuse.so.2 or dlopen, add it:

```bash
sudo apt install libfuse2t64   # Ubuntu 24.04 and newer
sudo apt install libfuse2      # Debian 12, Ubuntu 23.10 and older
```

[All downloads](/download)

## 2. Install a compiler

Pick the one for the format you write in. If you write both, install both.

- [LaTeX](latex/README.md)
- [Typst](typst/README.md)

> [!NOTE]
> Markdown needs neither. It has no compile step, so it works with nothing installed beyond Texpile itself.

## 3. Install git

Only for the Source Control panel. Everything else works without it.

- [Git](git.md)

## Do I need a compiler?

For editing, no. The visual editor, source editor, spell check, intellisense, and version control all work on their own. For compiling a PDF and for live preview, yes. Texpile runs the compiler on your computer and does not include one.

## Check it worked

Texpile checks for you. Preferences › Toolchain lists every external program it runs, for both formats, and whether each one was found.

> [!NOTE]
> Texpile only looks for programs when it starts, so restart it after installing anything before deciding a program is missing. The per-format pages above have the command-line test as well.

[Getting started](../getting-started.md)
[Compiling, in full](../latex/compiling.md)
