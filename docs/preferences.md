---
nav: Preferences
description: Every setting in Texpile's Preferences dialog, tab by tab: appearance, editor, collaboration, toolchain, integrations, startup, and the AI assistant.
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

| Setting                     | What it does                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode                        | Light, System, or Dark. System follows the operating system's light or dark setting.                                                           |
| Theme                       | The color theme, as tiles. See [Themes](themes.md).                                                                                            |
| Language                    | English, Simplified Chinese, Traditional Chinese, German, or Brazilian Portuguese. English is the default; the window reloads when you switch. |
| Dark PDF pages in dark mode | Darkens the pages in the PDF preview when the mode is dark. Off, the pages keep their original colors.                                         |

## Editor

| Setting                            | What it does                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autosave                           | On by default. Off, changes save only when you press Save, and you are warned before switching files. Live preview and hosting a shared session keep it on. |
| Spell check                        | Off by default. See [Spell check](spell-check.md).                                                                                                          |
| Comment button on selection        | The floating button that offers to comment on selected text, in both editors.                                                                               |
| Open terminal panel when compiling | Also opens Problems when a compile reports errors. Off, the badge next to Compile is the only signal.                                                       |
| Keybindings                        | Default, Vim, or Emacs, for the source editor. The mode line appears under the editor.                                                                      |

### Source editor

| Setting         | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| Wrap long lines | In Source mode, wrap long lines instead of scrolling sideways.  |
| Math preview    | A typeset preview of the math under the cursor, in source mode. |

### Visual editor

| Setting           | What it does                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Editor width      | How wide text gets in the visual editor. Extra window space stays empty, so short lines are easier to read. |
| Image resize step | Dragging an image snaps its width to multiples of this fraction of the text width: 10%, 25%, or 50%.        |

## Collaboration

How other people see you in a [shared session](collaboration.md). The name and the color apply whether you host the session or join one, and a change reaches the others straight away.

| Setting      | What it does                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display name | The name over your cursor, in the participant list, and on the review comments you write. It also fills in the join form. Left blank you appear as Host when you share, and as Guest when you join. |
| Color        | Your cursor color. Automatic gives the host blue, and every guest a color of their own.                                                                                                             |
| Git identity | The name and email git will use in the open folder. Comments fall back to that name while the display name is blank. Set them with git, not here.                                                   |

## Toolchain

Every external program Texpile runs, for LaTeX, Typst, and version control, and whether each one was found. Nothing is bundled; these are found on your PATH. Check again runs the check once more after you install something.

[Installation](installation/README.md)

## Integrations

| Setting          | What it does                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zotero citations | Adds Insert citation from Zotero to the right-click menu and the command palette in LaTeX and Typst documents. Needs Zotero running with the Better BibTeX plugin. Off hides the action. |

## Startup

| Setting                      | What it does                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reopen last folder on launch | Opens the folder you had open when you last quit, on the file you left open.                                                                     |
| Check for updates on launch  | Looks for a new version when Texpile starts and shows a notice you can dismiss. Downloading the update is a manual step, from the download page. |

## AI assistant

| Setting                                      | What it does                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP server                                   | Runs a local MCP server so an assistant such as Claude Code can see your open tabs, current file, caret, and unsaved changes. It cannot edit your documents. See [AI assistants (MCP)](integrations/mcp.md). |
| Let the assistant change the compile command | Off by default. The compile command runs as a shell command, so an assistant that can rewrite it can run any program on your computer. It can still change where the PDF and build files go.                 |
| Show instructions                            | The setup command for Claude Code and the config entry for Codex, with the real port filled in.                                                                                                              |
