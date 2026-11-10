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

Install Texpile first, then a compiler for the format you write in. Texpile can install TeX Live for LaTeX and tinymist for Typst from inside the app. Git is optional and recommended.

If Texpile is already installed, go to the guides:

- LaTeX: [a TeX distribution](latex/README.md).
- Typst: [tinymist](typst/README.md).
- Source Control: [git](git.md).

## 1. Install Texpile

Visit the [downloads page](/download) for the installer for your platform:

- **Windows:** After downloading, double-click the file to install.
- **Windows Portable:** The Windows installer is recommended over Windows Portable, which does not have auto update and may have certain features disabled. After downloading the zip, extract it and click Texpile.exe.
- **macOS:** Open the .dmg and drag Texpile to Applications.
- **Debian and Ubuntu:** Install the .deb with apt using `sudo apt install ./texpile.deb`.
- **Other Linux:** Download the AppImage build and run `chmod +x Texpile.AppImage`, then double-click the AppImage to start it.

### Install with the command line (Linux)

Debian-based distros:

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

Some distros require you to install FUSE 2 yourself. Refer to your distro's guide for FUSE 2. On Debian-based systems:

```bash
sudo apt install libfuse2t64
```

Or, for older Debian systems:

```bash
sudo apt install libfuse2
```

## 2. Install what you need

- LaTeX: [a TeX distribution](latex/README.md). Texpile installs TeX Live from Preferences › Programs & Compiler, or you install one yourself.
- Typst: [tinymist](typst/README.md). Texpile installs it from the **Set Up Typst** bar above a `.typ` file.
- Source Control: [git](git.md).
