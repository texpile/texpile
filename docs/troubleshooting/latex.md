---
nav: LaTeX
description: Fixes for a LaTeX compile that does not start, shows no PDF, keeps an old error, leaves question marks, or will not jump to the PDF.
order: 1
---

# Troubleshooting LaTeX

| You see                                                               | Fix                                                                                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Compile could not start", or **Set Up LaTeX** opens                  | No TeX distribution was found. [Install one](../installation/latex/README.md), or add its folder in **Set Up LaTeX**.                                     |
| "Compile finished, but no PDF appeared"                               | Read the Compile terminal for the error. If your command writes the PDF elsewhere, click **Configure** and set its path under **Advanced: Output Paths**. |
| Compile is greyed out, with "This project is set up to compile with:" | Click **Use It**, or save your own command.                                                                                                               |
| An error stays after you fixed it                                     | Compile menu › **Recompile from Scratch**.                                                                                                                |
| Citations or references print as **?**                                | Turn on **use latexmk** in the compile settings, then compile again.                                                                                      |
| The jump to the PDF does nothing                                      | Compile first, and keep `-synctex=1` in the compile command. If it says "No match.", try a spot in body text.                                             |
| "A compile is already running."                                       | Wait, or press Ctrl Alt Enter to stop it.                                                                                                                 |
| The compile with `-shell-escape` is refused                           | You are hosting a shared session. End it, then compile.                                                                                                   |
| The command fails on Windows                                          | Your compile command runs in the Command Prompt (`cmd.exe`). Use its quoting rules.                                                                       |
| Format Document opens **Set Up LaTeX**                                | `latexindent` was not found. Install it with your distribution.                                                                                           |

## Live preview

| You see                                                   | Fix                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "lualatex was not found, so the live preview cannot run." | Click **Check Toolchain** and install or locate lualatex.                                                |
| "Live preview is active in another window."               | Click **Use Live Preview Here**.                                                                         |
| **preview error**                                         | Open Problems to see the error. A document that needs pdflatex cannot use the live preview: use Compile. |
| Live mode cannot be turned on                             | You are hosting a shared session. End it first.                                                          |
