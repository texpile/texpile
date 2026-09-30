---
nav: Preferences
description: Every setting in Texpile's Preferences dialog, tab by tab: appearance, editor, version control, collaboration, toolchain, integrations, startup, and the AI assistant.
blurb: Every setting in the Preferences dialog, tab by tab.
icon: settings
order: 15
section: Settings
---

# Preferences

Settings apply to every folder you open. The compile command and its options are the exception: they are saved per folder, in a .texpile folder inside it.

| Where to find it | Path                | Note                   |
| ---------------- | ------------------- | ---------------------- |
| Start screen     | Preferences…        |                        |
| Menu             | File › Preferences… | Once a folder is open. |

## Appearance

| Setting                     | What it does                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode                        | Light, System, or Dark. System follows the operating system's light or dark setting.                                                                                               |
| Theme                       | The color theme, as tiles. See [Themes](themes.md).                                                                                                                                |
| Transparent window          | Off by default. The desktop shows through the window's background, blurred. Text and content stay solid, and menus and dialogs blur what is under them. Windows 11 and macOS only. |
| Language                    | English, Simplified Chinese, Traditional Chinese, German, or Brazilian Portuguese. English is the default; the window reloads when you switch.                                     |
| Dark PDF pages in dark mode | Darkens the pages in the PDF preview when the mode is dark. Off, the pages keep their original colors.                                                                             |

## Editor

| Setting                            | What it does                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autosave                           | On by default. Off, changes save only when you press Save, and you are warned before switching files. Live preview and hosting a shared session keep it on. |
| Spell check                        | Off by default. See [Spell check](spell-check.md).                                                                                                          |
| Toolbar on selection               | Buttons over selected text for commenting, and for Refine when an agent is set up. In both editors.                                                         |
| Smart paste                        | Formatting, tables, and Markdown from other apps come in converted. Off, they paste as plain text. In both editors.                                         |
| Open terminal panel when compiling | Also opens Problems when a compile reports errors. Off, the badge next to Compile is the only signal.                                                       |
| Keybindings                        | Default, Vim, or Emacs, for the source editor. The mode line appears under the editor.                                                                      |

### Source editor

| Setting         | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| Wrap long lines | In Source mode, wrap long lines instead of scrolling sideways.  |
| Math preview    | A typeset preview of the math under the cursor, in source mode. |

### Visual editor

| Setting           | What it does                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor width      | How wide text gets in the visual editor. Extra window space stays empty, so short lines are easier to read.                                                     |
| Justify text      | On by default. Paragraphs run from edge to edge. This changes how the editor looks and does not change the compiled document.                                   |
| Hyphenate words   | On by default, and shown while Justify text is on. Long words can split at line ends. The hyphens are only drawn in the editor and are not written to the file. |
| Image resize step | Dragging an image snaps its width to multiples of this fraction of the text width: 10%, 25%, or 50%.                                                            |

## Version Control

### Git

| Setting      | What it does                                                                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autofetch    | On by default. When enabled, commits will automatically be fetched from the default remote of the current Git repository every 3 minutes, while Texpile is in front, so Sync shows how many commits there are to pull. The working tree does not change until you Sync. |
| Git Identity | The user.name and user.email git will use in the open folder. Comments fall back to that name while the display name under Collaboration is blank. Shown read-only: set them with git config in a terminal.                                                             |

### Local History

| Setting            | What it does                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep local history | On by default. A copy of each file as you save it, kept on this computer for 30 days ([Local history](version-control.md#local-history)). Off records nothing; what was kept stays. |
| Saved copies       | How much space Local History takes. Open it for Clear Local History…, which deletes every copy of every file.                                                                       |

## Collaboration

How other people see you in a [shared session](collaboration.md). The name and the color apply whether you host the session or join one, and a change reaches the others straight away.

| Setting      | What it does                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display name | The name over your cursor, in the participant list, and on the review comments you write. It also fills in the join form. Left blank you appear as Host when you share, and as Guest when you join. |
| Color        | Your cursor color. Automatic gives the host blue, and every guest a color of their own.                                                                                                             |

## Toolchain

Every external program Texpile runs, for LaTeX, Typst, and version control, and whether each one was found. Nothing is bundled; these are found on your PATH and in the folders you add here. Folders are searched first, by every program Texpile starts, the compile command and the Refine agent included, so a TeX distribution installed somewhere that is not on your PATH works once its bin folder is added. Type a folder into the path field, or use Browse to pick one; Locate next to a missing program picks the program and fills in its folder. A relative path counts from the folder Texpile runs from. Browse fills in a relative path for a folder on the same drive as a portable Texpile, so it still works after the drive letter changes, and an absolute path otherwise; either can be edited before Add. Distribution lists the installs found on this machine, TeX Live and MiKTeX under LaTeX and each tinymist with the Typst it carries under Typst, and names the one your PATH reaches. Choosing one puts its bin folder first in Folders, so every program of that kind comes from that install; From PATH takes it out again. Check Again runs the check once more after you install something.

Under Typst, Texpile's copy installs tinymist for you when none is found: Install tinymist downloads the release Texpile is tested with from GitHub, checks it against the published checksum, and keeps it in Texpile's data folder (the `data` folder of a portable Texpile). It is used right away, with no restart. Reinstall fetches it again and Remove deletes it. A tinymist on your PATH or in Folders always comes first, and the row says so when it does. The tinymist row names the one in use, Texpile's copy or PATH. See [Typst](installation/typst/README.md#from-texpile).

[Installation](installation/README.md)

## Integrations

| Setting          | What it does                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zotero citations | Adds Insert Citation from Zotero to the right-click menu and the command palette in LaTeX and Typst documents. Needs Zotero running with the Better BibTeX plugin. Off hides the action. |

## Startup

| Setting                      | What it does                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reopen last folder on launch | Opens the folder you had open when you last quit, on the file you left open.                                                                     |
| Check for updates on launch  | Looks for a new version when Texpile starts and shows a notice you can dismiss. Downloading the update is a manual step, from the download page. |

## AI assistant

| Setting           | What it does                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP server        | Runs a local MCP server so an assistant such as Claude Code can see your open tabs, current file, caret, and unsaved changes. It can propose edits, which appear as suggestions for you to accept or reject. See [AI assistants (MCP)](integrations/mcp.md).                                                                                                                              |
| Show Instructions | A message to paste into your assistant, with the real port filled in, so the assistant can set up the connection itself.                                                                                                                                                                                                                                                                  |
| Refine with       | The agent that Refine in the right-click menu uses: Claude Code, Codex, Antigravity CLI, or a command of your own. The selected text and the text around it go to the service that agent uses. An agent installed somewhere your PATH does not reach is found once its folder is added under Toolchain, in Folders. See [Refine selected text](integrations/mcp.md#refine-selected-text). |
| Model             | Shown for a listed agent: the models the agent itself lists for your account. Default leaves the choice to the agent.                                                                                                                                                                                                                                                                     |
| Command           | Shown for a custom command: the program to run, with its options, for example `ollama run llama3.1`. Texpile sends it the request as input and uses what it prints.                                                                                                                                                                                                                       |
| Try the agent     | Sends a one-word request and shows the answer, or why the agent did not answer, so you can check it before you use Refine.                                                                                                                                                                                                                                                                |
