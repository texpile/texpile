---
nav: Preferences
description: Open Preferences in Texpile and find the settings whose effect is not obvious from their label.
blurb: The settings that need more than their label.
icon: settings
order: 33
section: Customize
---

# Preferences

Settings for the whole app. Open it with Ctrl , (Cmd , on macOS) or File › Preferences… (Texpile › Preferences… on macOS).

![The Appearance tab of Preferences, with the list of tabs on the left](../landing/src/lib/assets/showcase/docs/app/preferences-appearance.png)

| Setting                                     | Note                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Appearance › Language                       | Changes the interface only. Spell check follows each document's own language.                                                  |
| Editor › Open terminal panel when compiling | When off, the badge next to Compile is the only sign of errors.                                                                |
| Editor › Keybindings                        | Vim and Emacs work in the source editor only.                                                                                  |
| Editor › Justify text, Hyphenate words      | Change the visual editor only, not the compiled document or the file.                                                          |
| Spelling › Check spelling and grammar       | Off by default.                                                                                                                |
| Spelling › Spelling language                | For documents that name no language. English by default.                                                                       |
| Spelling › Custom Dictionary                | One list per language. Separate several words with spaces, commas, or semicolons.                                              |
| Spelling › Grammar rules                    | All off by default. Shown while Spelling language is English, the one language grammar is checked in.                          |
| Version Control › Autofetch                 | Fetches from the default remote every 3 minutes.                                                                               |
| Version Control › Git Identity              | Read-only. Change it with `git config` in a terminal.                                                                          |
| Version Control › Keep version history      | Keeps a copy of each save for 30 days.                                                                                         |
| Collaboration › Display name                | Shown in shared sessions and on your comments. Left empty, you show as Host or Guest.                                          |
| Toolchain › Folders                         | Texpile looks here first for every program it runs, your compile command too. See [Toolchain](build-and-preview/toolchain.md). |
| Toolchain › Distribution                    | Which TeX distribution, and which tinymist, to use when more than one is found.                                                |
| Integrations › Find and cite papers online  | Looks papers up through Crossref, DataCite, doi.org, Open Library, and PubMed.                                                 |
| AI Assistant › MCP server                   | Lets an AI assistant such as Claude Code see your open files. See [MCP server](ai-assistant/mcp.md).                           |
| AI Assistant › Refine with                  | An agent Texpile cannot find cannot be picked. Add its folder under Toolchain › Folders.                                       |
| AI Assistant › Agent tab                    | Untick every agent to remove the tab.                                                                                          |

## Not in Preferences

- The compile command, output paths, and live mode are saved per folder: Terminal › Configure Compile Command….
- Interface zoom: View › Zoom In, Zoom Out, Reset Zoom.
- Dark PDF pages: **Invert page colors** on the PDF toolbar, remembered separately for light and dark mode.
