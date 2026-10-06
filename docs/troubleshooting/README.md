---
nav: Troubleshooting
overview: General
description: Fixes for messages and problems in Texpile, from missing programs to editing, citations, AI and updates.
blurb: Find the message you see and what to do.
icon: life-buoy
order: 36
section: Troubleshooting
---

# Troubleshooting

Find the message you see. [LaTeX](latex.md), [Typst](typst.md), [Git](git.md) and [shared sessions](collaboration.md) have their own pages.

## Programs

| You see                                                  | Fix                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| A program shows **Not found** in Preferences › Toolchain | Click **Locate** and pick the program's file, or add its folder in Folders. |
| **Found, does not run**                                  | Texpile found the program, but it would not start. Reinstall it.            |
| "No main file is set."                                   | Click **Set Main File**.                                                    |
| Git features are missing                                 | [Install git](../installation/git.md).                                      |

## Editing

| You see                                  | Fix                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "Opened in Source mode"                  | The file is too large for the visual editor. Edit it in the source editor.                                    |
| "Some blocks were rewritten"             | Nothing to fix. Parts you edited in the visual editor were saved in full, so their source may look different. |
| "The saved file may not reopen as shown" | The file on disk may not match the editor. The previous version is in File › Version History….                |
| "This file is not UTF-8"                 | The file opens read-only. To edit it, save it as UTF-8 in another editor.                                     |
| "Not available in single file mode"      | You opened a single file without its folder. Click **Open in Workspace**.                                     |
| A comment shows **Detached**             | The text it was on changed. Select the right text, open the thread and click **Attach to Selection**.         |
| A comment shows **Check placement**      | The sentence appears more than once. Check which copy the comment is on.                                      |
| Pasted text loses its formatting         | Turn on Preferences › Editor › Smart paste.                                                                   |
| The editor is justified, the PDF is not  | Preferences › Editor › Justify text changes only the editor.                                                  |
| No spelling underlines                   | Turn on Preferences › Spelling › Check spelling and grammar.                                                  |

## Citations

| You see                                 | Fix                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Zotero needs the Better BibTeX plugin" | Install [Better BibTeX](https://retorque.re/zotero-better-bibtex/installation/) in Zotero. |
| "Could not reach …"                     | You are offline, or a proxy blocks the paper lookup.                                       |

## AI

| You see                           | Fix                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| An agent shows **Not found**      | Install it, or add its folder in Preferences › Toolchain › Folders.                           |
| No Agent tab                      | Tick an agent in Preferences › AI Assistant › Agent tab.                                      |
| "Not running: …" under MCP server | Another program uses the port. See [Change the port](../ai-assistant/mcp.md#change-the-port). |
| "The text from … was not used"    | The agent's result broke a rule. The note under it says which.                                |

## Updates

| You see                                        | Fix                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| "Could not check for updates", "Update failed" | Try Help › Check for Updates again, or [download](/download) the new version. |
| "Updates are not available in this build"      | [Download](/download) and install the new version yourself.                   |
