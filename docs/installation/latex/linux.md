---
nav: Linux
description: Install TeX Live on Linux with apt or from upstream so Texpile can compile LaTeX documents.
blurb: TeX Live from apt, or from upstream.
icon: linux
order: 3
---

# LaTeX on Linux

TeX Live from apt, or the current release from upstream.

## With apt

```bash
sudo apt install texlive-full
```

Smaller, builds most papers (add `biber` for biblatex):

```bash
sudo apt install texlive-latex-recommended texlive-latex-extra latexmk
```

## From upstream

Download and run the TeX Live installer:

```bash
cd /tmp
curl -L -o install-tl-unx.tar.gz https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz
zcat < install-tl-unx.tar.gz | tar xf -
cd install-tl-2*
perl ./install-tl --no-interaction
```

For a smaller install, end with `--scheme=small --no-doc-install --no-src-install`.
