---
description: Texpile runs your own compile command in a built-in terminal, reads the compile and bibliography logs into a Problems panel, and supports SyncTeX both ways.
blurb: Your own command, in a real shell, with the log read into a Problems panel.
icon: play
order: 2
---

# Compiling

Texpile runs the compile command you choose, on your computer, and shows what came back.

| Where to find it | Path                                  | Note                                           |
| ---------------- | ------------------------------------- | ---------------------------------------------- |
| Menu             | Terminal › Compile                    |                                                |
| Menu             | Terminal › Configure compile command… | The command, the engine, and live mode.        |
| Menu             | Terminal › New terminal               | Opens another shell alongside the running one. |
| Shortcut         | Ctrl+Alt+Enter                        | Start or stop a compile.                       |
| Panel            | Problems                              | In the dock at the bottom of the window.       |

> [!NOTE]
> Compiling needs a TeX distribution: TeX Live, MiKTeX, or MacTeX. Editing works without one.

## The command

Terminal › Configure compile command… sets what runs. Any shell command works, `{main}` expands to your main file, and the command is saved per folder. Use default puts the default back. Under Advanced: output paths you can name the PDF and log file yourself, for a custom `-jobname` or an unusual output layout.

```bash
latexmk -pdf {main}
```

![The compile command dialog: engine picker, the shell command, and the Live mode toggle](../../landing/src/lib/assets/showcase/app/compile-command-modal.png)

## Problems panel

Errors and warnings from the compile and bibliography logs, in plain language. Click one to jump to its line. Open the panel from the Problems tab in the dock, or from the badge beside the Visual / Source toggle.

![The Problems panel listing the warnings from a compile, with the PDF beside the editor](../../landing/src/lib/assets/showcase/app/problems-panel.png)

## SyncTeX

In the source editor, right-click a line and choose Show in PDF, or click the arrow button at the top of the divider between the editor and the PDF. Double-click text in the PDF to jump back to the source.

![The sync-to-PDF arrow button on the divider between the source editor and the PDF](../../landing/src/lib/assets/showcase/app/sync-to-pdf-icon.png)

## Terminal

Compiles run in a terminal named Compile in the dock. Terminal › New terminal opens another shell beside it.
