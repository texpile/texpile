---
nav: Installation
description: Install Texpile on Windows, macOS, or Linux, then a TeX distribution for LaTeX, tinymist for Typst, and git for version control.
blurb: Install Texpile, then a compiler for the format you write in.
icon: hard-drive-download
order: 1
pager: skip-children
section: Get started
---

# Installation

Install Texpile, then the compiler for the format you write in.

## 1. Install Texpile

- **Windows:** run the installer. The portable zip on the [downloads page](/download) does not update itself.
- **macOS:** open the .dmg and drag Texpile to Applications.
- **Debian and Ubuntu:** install the .deb with apt. Keep the leading `./`.

```bash
wget https://dl.texpile.com/latest/deb -O texpile.deb
sudo apt install ./texpile.deb
```

Other Linux distributions use the AppImage:

```bash
wget https://dl.texpile.com/latest/linux -O Texpile.AppImage
chmod +x Texpile.AppImage
./Texpile.AppImage
```

If it exits with a message about libfuse.so.2, install FUSE 2:

```bash
sudo apt install libfuse2t64   # Ubuntu 24.04 and newer
sudo apt install libfuse2      # Debian 12, Ubuntu 23.10 and older
```

## 2. Install what you need

- LaTeX: [a TeX distribution](latex/README.md).
- Typst: [tinymist](typst/README.md).
- Source Control: [git](git.md).
