---
nav: Linux
description: Install TeX Live on Linux with apt or from upstream so Texpile can compile LaTeX documents.
blurb: TeX Live from apt, or from upstream.
icon: linux
order: 3
---

# LaTeX on Linux

Texpile can install TeX Live for you on Linux with glibc. See [From Texpile](README.md#from-texpile-recommended). To install TeX Live yourself, read on.

Installing from upstream is recommended since the TeX distribution in your distro's repositories might be outdated.

## From upstream

Download and run the TeX Live installer:

```bash
cd /tmp
curl -L -o install-tl-unx.tar.gz https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz
zcat < install-tl-unx.tar.gz | tar xf -
cd install-tl-2*
perl ./install-tl --no-interaction
```

## With apt

```bash
sudo apt install texlive-full
```

A smaller set that should be enough for most papers:

```bash
sudo apt install texlive-latex-recommended texlive-latex-extra latexmk biber
```
