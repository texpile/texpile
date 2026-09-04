---
nav: LaTeX
description: Install a TeX distribution so Texpile can compile LaTeX: TeX Live or MiKTeX on Windows, MacTeX or BasicTeX on macOS, and TeX Live on Linux.
blurb: A TeX distribution: TeX Live, MacTeX, or MiKTeX.
icon: sigma
order: 1
---

# LaTeX

LaTeX needs a TeX distribution. It is packaged under a different name on each platform.

- [Windows](windows.md)
- [macOS](macos.md)
- [Linux](linux.md)

> [!NOTE]
> TeX Live, MacTeX, and MiKTeX are separate projects. Every download and package source on these pages belongs to those projects or to your distribution, and Texpile controls none of them. Check that a command and where it points look right to you before running it.

## Check it worked

In a terminal, ask latexmk for its version. If that prints a version, Texpile will find it too:

```bash
latexmk --version
```

Then open a folder in Texpile and press Compile. The default command is latexmk with lualatex, and anything that goes wrong appears in the Problems panel.

> [!NOTE]
> Texpile only looks for programs when it starts, so restart it after installing before deciding a program is missing. Preferences › Toolchain lists every program Texpile runs and whether it was found.

[Back to installation](../README.md)
[Compiling, in full](../../latex/compiling.md)
