---
nav: Git
description: Install git on Windows, macOS, or Linux so Texpile's Source Control panel can commit, sync, and clone your files.
blurb: git, for the Source Control panel.
icon: git-branch
order: 3
---

# Git

Install git to use Source Control and to clone projects.

![The Source Control view in the sidebar saying Git not found, with How to install Git and Check Again](../../landing/src/lib/assets/showcase/docs/app/git-not-found.png)

| System         | Command                                          |
| -------------- | ------------------------------------------------ |
| Windows        | `winget install --id Git.Git -e --source winget` |
| macOS          | `xcode-select --install`, or `brew install git`  |
| Debian, Ubuntu | `sudo apt install git`                           |
| Fedora         | `sudo dnf install git`                           |
| Arch           | `sudo pacman -S git`                             |

On Windows, the installer from [git-scm.com](https://git-scm.com/download/win) works too. Then click **Check Again**.
