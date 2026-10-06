---
nav: Privacy
description: What stays on your computer, and every case where Texpile goes online or sends data.
order: 3
---

# Privacy

Texpile works offline and has no account. Your files, compiling, previews, spell and grammar check, comments, version history and settings stay on your computer. Texpile talks to Zotero on your computer only.

## When Texpile goes online

| What                        | When                                           | What is sent, and where                                                                                                                                                     | To avoid it                                                                     |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Update check                | On launch, and on `Help › Check for Updates`   | A request to updates.texpile.com, which counts the check. The download, from dl.texpile.com, starts only when you click **Download Update**.                                | Turn off `Preferences › Startup › Check for updates on launch`.                 |
| Autofetch                   | Every 3 minutes while a Git repository is open | A fetch from the repository's default remote.                                                                                                                               | Turn off `Preferences › Version Control › Git › Autofetch`.                     |
| Git remotes                 | When you Sync, Clone or Publish                | Your commits, to the remote you chose, such as GitHub or Overleaf.                                                                                                          | Do not use those buttons.                                                       |
| Sign in with GitHub         | When you sign in or publish to GitHub          | Requests to github.com and api.github.com.                                                                                                                                  | Do not sign in.                                                                 |
| Shared sessions             | When you host or join                          | Your edits, encrypted, through a relay server (default wss://collab.texpile.com). Browser guests join at join.texpile.com. Anyone with the code can edit every shared file. | Do not host or join. See [Real-time collaboration](../collaboration/README.md). |
| Find and cite papers online | When you look up a title or ID                 | What you typed, to doi.org, Crossref, DataCite, Open Library or PubMed, with Texpile's name and version.                                                                    | Turn off `Preferences › Integrations › Find and cite papers online`.            |
| Install tinymist            | When you click **Install tinymist**            | A download from dl.texpile.com, checked against a checksum.                                                                                                                 | Install tinymist yourself.                                                      |
| Typst templates             | When you open the Typst Templates gallery      | A request to packages.typst.org for the template list and pictures.                                                                                                         | Use a built-in template.                                                        |

These requests follow your system's proxy settings.

## AI features

Texpile holds no AI keys. Agents run on your computer, and what they send online depends on the agent.

| Feature    | What the agent sees                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refine     | The selection, 1,500 characters before it and 600 after (4,000 and 1,500 for **Match writing style**), the file format and the task. A custom command gets the same and sends it wherever it sends it.                 |
| Agent tab  | Your messages, attached files, selections and images, and anything the agent reads or runs in the folder. It can run commands and edit files there, within its own permission prompts.                                 |
| MCP server | Off by default. When on, it listens on this computer only (127.0.0.1). A connected assistant can read your open files, cursor position, unsaved changes, errors and comments, and its provider receives what it reads. |

To use none of this, leave the MCP server off, set **Refine with** to **None**, and untick every agent under **Agent tab** in `Preferences › AI Assistant`.
