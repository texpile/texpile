---
nav: Windows
description: Install TeX Live or MiKTeX on Windows so Texpile can compile LaTeX documents.
blurb: TeX Live from CTAN, or MiKTeX.
icon: windows
order: 1
---

# LaTeX on Windows

The installer has a graphical setup and configures itself, so there is nothing to add to your search path (PATH) by hand on this platform.

## Install TeX Live

Download `install-tl-windows.exe` from CTAN and run it. An Advanced button has the scheme and directory options if you want a smaller install or a different location. It adds TeX Live to your search path when it finishes.

[install-tl-windows.exe](https://mirror.ctan.org/systems/texlive/tlnet/install-tl-windows.exe)
[TeX Live on Windows](https://www.tug.org/texlive/windows.html)

> [!NOTE]
> A full install is 7 GB or more and can take a long time. The Advanced screen lets you pick a smaller scheme, and TeX Live Manager adds packages later as documents need them.

> [!NOTE]
> MiKTeX works as well, but only one of the two can be active at a time, because they share the same search path.

## Check it worked

The installer edits the search path, so a Command Prompt that was already open will not see TeX until you close and reopen it. Texpile only looks for programs when it starts, so restart Texpile too.

[Checking the install](README.md)
