---
description: Texpile keeps versions of your project with git: save a version with a message, see what changed since the last one in a visual diff, and restore an older version from the history.
blurb: Save versions of your project, see what changed, and restore an older one.
icon: git-branch
order: 8
section: Editor
---

# Version control

Texpile keeps versions of your project with git, from the Source Control panel. Changes since the last version are listed by file, you tick the ones to include, write what changed, and Save version. History lists every saved version, and any of them can be restored. If the folder is not a repository yet, the panel offers to initialise one.

| Where to find it | Path                    | Note                                     |
| ---------------- | ----------------------- | ---------------------------------------- |
| Panel            | Source Control          | The branch icon in the sidebar header.   |
| In the panel     | Click a changed file    | Opens the diff against the last version. |
| Palette          | Switch to the diff view | Ctrl+K, then type the name.              |

![The Source Control panel: three changed files, the message box, Save version, and the history](../landing/src/lib/assets/showcase/app/source-control-panel.png 'The Source Control panel: three changed files, the message box, Save version, and the history')

## Visual diff

A changed file opens in a diff against the last version. In the visual editor the changes are marked in the formatted text, word by word. In the source editor they are marked line by line.

![The visual editor showing a heading and a sentence changed since the last version](../landing/src/lib/assets/showcase/app/diff-view.png 'The visual editor showing a heading and a sentence changed since the last version')

> [!NOTE]
> This covers the everyday loop. For branches, remotes, and history rewriting, use the built-in terminal. It needs git installed.

[Installing git](installation/git.md)
