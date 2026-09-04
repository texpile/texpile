---
nav: macOS
description: Install MacTeX or BasicTeX on macOS so Texpile can compile LaTeX documents.
blurb: MacTeX, or BasicTeX for a smaller install.
icon: apple
order: 2
---

# LaTeX on macOS

MacTeX is TeX Live with a native Mac installer, so there is no terminal work here.

## Install MacTeX

Runs on Intel and Apple silicon, and needs macOS 11 Big Sur or newer. When it finishes, everything is configured. BasicTeX is the same distribution cut down to about 140 MB, with packages added later using `tlmgr`.

[MacTeX download](https://www.tug.org/mactex/mactex-download.html)
[About MacTeX](https://www.tug.org/mactex/)

> [!NOTE]
> MacTeX installs TeX Live Utility in /Applications/TeX. Use it to keep the distribution updated.

## If latexmk comes back "not found"

Open a new Terminal window, and quit and reopen Texpile, before deciding something is wrong.

> [!NOTE]
> If it is still missing, run the MacTeX installer again, or open TeX Live Utility and use its repair option.

[Checking the install](README.md)
