---
nav: Linux
description: Install TeX Live on Linux with apt or from upstream so Texpile can compile LaTeX documents.
blurb: TeX Live from apt, or from upstream.
icon: linux
order: 3
---

# LaTeX on Linux

On Debian, Ubuntu, and their derivatives this is one apt command. Everywhere else, use your own package manager or install from upstream.

## With apt

One command, nothing to add to your PATH afterwards, and TeX updates arrive with your system updates:

```bash
sudo apt install texlive-full
```

`texlive-full` is around 5 GB. This is a much smaller starting point that still builds most papers, and you can add packages later:

```bash
sudo apt install texlive-latex-recommended texlive-latex-extra latexmk
```

> [!NOTE]
> Other distributions package TeX Live too, under their own names. Look for a texlive-scheme-full or texlive meta package in dnf, pacman, or zypper.

## From upstream

A packaged build trails the current TeX Live release, often by a year or more. For the current release, install from upstream instead. This does not need root as long as you can write to the destination:

```bash
cd /tmp
curl -L -o install-tl-unx.tar.gz https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz
zcat < install-tl-unx.tar.gz | tar xf -
cd install-tl-2*
perl ./install-tl --no-interaction
```

That installs everything, which is 7 GB or more and can take a long time. For a much smaller install, roughly the equivalent of BasicTeX at 600 MB or so:

```bash
perl ./install-tl --no-interaction --scheme=small --no-doc-install --no-src-install
```

> [!NOTE]
> This downloads an installer from a CTAN mirror and runs it. Texpile does not control CTAN or its mirrors. TeX Live publishes checksums and signatures for the installer if you want to verify it before running it.

> [!NOTE]
> The default paper size is A4. Run `tlmgr paper letter` afterwards to change it.

## Setting your PATH

This is only for the upstream install. With apt it is already done. The installer prints the exact line to add when it finishes. Put it in your shell's init file, substituting your release year and platform:

```bash
export PATH=/usr/local/texlive/2026/bin/x86_64-linux:$PATH
```

> [!NOTE]
> Skipping this is the usual reason a fresh TeX install appears to be missing. Texpile only looks for programs when it starts, so after editing your init file, log out and back in, then restart Texpile, before deciding something went wrong.

[Checking the install](README.md)
