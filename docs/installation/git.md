---
nav: Git
description: Install git on Windows, macOS, or Linux so Texpile's version control panel can stage, commit, and diff your files.
blurb: One program, git, for the Source Control panel.
icon: git-branch
order: 3
---

# Git

Version control in Texpile runs on the git installed on your computer. Editing works without it. The Source Control panel does not: it says Git not found, with Download Git, which opens this page, and Check Again.

## Windows

Install from winget, or download the installer from git-scm.com and run it. Both add git to your search path.

```powershell
winget install --id Git.Git -e --source winget
```

[Git for Windows](https://git-scm.com/download/win)

## macOS

Apple's command line tools include git. Run this in Terminal and accept the prompt, or install git with Homebrew.

```bash
xcode-select --install
```

```bash
brew install git
```

## Linux

Your package manager has it.

```bash
sudo apt install git
```

On Fedora it is `sudo dnf install git`, and on Arch `sudo pacman -S git`.

## Tell git who you are

A commit carries a name and an email address, git's user.name and user.email. Texpile asks for them (Author identity unknown) the first time you commit if git does not know them yet, or set them once yourself:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## Check it worked

```bash
git --version
```

> [!NOTE]
> After installing, click Check Again in Source Control. If git is still not found, restart Texpile: on Windows a new install's path only reaches programs started after it. Preferences › Toolchain lists git under Version Control and says whether it was found.

[Version control](../version-control.md)
