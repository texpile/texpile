---
description: Texpile runs git from its Source Control panel: commit your changes with a message, see what changed since HEAD in a visual diff, restore an older commit from the Graph, and publish and sync the project with GitHub or any other remote.
blurb: Commit your changes, see what changed, restore an older commit, and publish to GitHub.
icon: git-branch
order: 8
section: Editor
---

# Version control

Texpile runs git from the Source Control panel. Changes in the working tree are listed by file: stage the ones to commit with their checkboxes, write a message, and Commit. Graph lists every commit, and any of them can be restored. If the folder is not a repository yet, the panel offers Initialize Repository, and Publish Branch pushes it to GitHub or any other remote.

A file's checkbox reads Stage Changes, or Unstage Changes once staged; a group's reads Stage All Changes or Unstage All Changes. What you unstage stays unstaged after a commit and after Texpile restarts, until the file has no changes left. The message box names the branch the commit goes to: Message (Ctrl+Enter to commit on "main"). Discard Changes, in a file's menu, reverts it to HEAD; on an untracked file it asks Are you sure you want to DELETE the following untracked file: '…'? and moves the file to the Trash.

Ctrl+Shift+G (⌃⇧G on a Mac, as in VS Code) opens Source Control with the keyboard in the message box; Show Source Control in the command palette does the same. While the open file has uncommitted changes, Open Changes, the button beside Visual and Source in the editor's top bar, compares it with HEAD.

The Source Control icon shows how many files have changed, not counting build output. With nothing to commit, the list reads Nothing to commit, working tree clean, and the panel's main button is the next thing to do: Sync Changes, with the commits to pull and push, or Publish Branch for a branch that has no remote branch yet.

If the folder doesn't have a Git repository, Source Control offers Initialize Repository, which runs git init in the folder, on this computer only. The changes list then shows every file, staged, except build output and big untracked folders: unstage anything that should stay on this computer (a private draft, a data file) and make your first commit. Publish Branch then appears, where you choose GitHub or any other host.

If the folder sits inside a larger repository, such as a home folder kept in git or a research repository with the paper in one subfolder, Source Control asks before using it: commits made there go into that repository, with everything else in it. Open Repository uses that repository; Initialize Repository runs git init in this folder, as a repository of its own. Until you answer, Texpile leaves that repository alone, as VS Code does: no colours in the file tree, no count on the Source Control icon and no marks in the margin. The answer is remembered for the folder.

| Where to find it | Path                    | Note                                   |
| ---------------- | ----------------------- | -------------------------------------- |
| Panel            | Source Control          | The branch icon in the sidebar header. |
| In the panel     | Click a changed file    | Opens the diff against HEAD.           |
| Palette          | Switch to the Diff View | Ctrl+K, then type the name.            |

![The Source Control panel: three changed files, the message box, Commit, and the Graph](../landing/src/lib/assets/showcase/app/source-control-panel.png 'The Source Control panel: three changed files, the message box, Commit, and the Graph')

## Visual diff

A changed file opens in a diff against HEAD, under Changes since HEAD. In the visual editor the changes are marked in the formatted text, word by word. In the source editor they are marked line by line.

In the source editor, the margin beside the line numbers marks what changed since HEAD as you type: green for added lines, orange for changed ones, and a red wedge where lines were removed: the colors the file list gives an added, changed or deleted file. Alt+F5 and Shift+Alt+F5 (also in the command palette) go to the next and previous change. Click a mark to open Git Local Changes (Working Tree), which shows those lines as they are in HEAD (for new lines, These lines are not in HEAD.), with Revert Change to revert just that change and keep every other edit. Escape closes it. Revert Selected Ranges in the command palette does the same for the change at the cursor.

In a comparison, the arrows in its bar (or Alt+F5 and Shift+Alt+F5 in the source comparison) go to the next and previous change, and Revert Change beside a change replaces those lines with the commit's, leaving the rest of your edits alone.

In the file tree, a changed file's name takes its status colour, a deleted one is struck through in Source Control, a file with merge conflicts carries a red !, and a folder with changes inside it is tinted and marked with a dot, so a changed chapter can be found without opening every folder.

A commit in Graph opens to what differs between it and the working tree. To see what that commit itself changed, open its menu and choose Open Commit: its files are listed with each one's difference from its parent. Restore, in the same menu, asks Are you sure you want to restore '…'? and brings the files back as a new commit, Restore "…", so it can be undone. With uncommitted changes it offers Commit & Restore, which first commits them as WIP before restoring "…".

![The visual editor showing a heading and a sentence changed since HEAD](../landing/src/lib/assets/showcase/app/diff-view.png 'The visual editor showing a heading and a sentence changed since HEAD')

## Local history

Every time you save a file, Texpile keeps a copy of it, as VS Code's local history does. It also keeps one just before anything replaces text no other copy holds: discarding changes in Source Control, restoring a copy, and reloading a file that changed outside Texpile over edits you had not saved. This happens in every project, including one that has never used git, and the copies stay on your computer in Texpile's own data, not in the project. Git commits are a separate history, in Source Control's Graph.

| Where to find it | Path                                                               | Note                                   |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Menu             | File › Local History…                                              | The open file's copies.                |
| Menu             | File › Restore Deleted File…                                       | Files deleted from the project.        |
| File explorer    | Right-click a file › Local History…                                |                                        |
| File explorer    | Right-click a folder › Restore Deleted File…                       | Only files deleted from that folder.   |
| Tabs             | Right-click a tab › Local History…                                 |                                        |
| Palette          | Local History…, Restore Deleted File…                              | Ctrl+K, then type the name.            |
| Setting          | Preferences › Version Control › Local History › Keep local history | Off records nothing; kept copies stay. |

The dialog lists the copies by day, newest first. A copy that gathered several saves shows the span it covers, a copy you named shows its name, and one taken before something replaced the text says what (Before discard, Before restore, Before reload). Pick a copy to see it against the file as it is now, or against the copy before it. Restore This Copy asks first, keeps what the file holds now as a copy of its own, and the notice after it offers Undo. Copy puts the copy's text on the clipboard. Save a Copy Now… keeps the file as it is under a name you choose, and a copy's … menu renames or deletes it.

Restore Deleted File lists the files that are gone and still have copies; pick one, then a copy, and Restore This Copy brings it back, its folder too.

Discarding changes in Source Control keeps each file first, and the notice after offers Undo.

Saves go into the same copy until it is 5 minutes old, so an hour of writing makes about twelve copies however often you pause. Every copy is kept for 7 days, then the last one of each day for 30 days; a copy you named, and the newest copy of each file, are kept until you delete them. Files over 1 MB are not kept, and when all copies together pass 300 MB the oldest go first. Renaming or moving a file takes its copies with it. Preferences › Version Control shows how much space they take under Saved copies, which opens to Clear Local History… to delete them all.

The copies are in a History folder in Texpile's data: `%APPDATA%\texpile-desktop` on Windows, `~/Library/Application Support/texpile-desktop` on macOS, `~/.config/texpile-desktop` on Linux. The portable build keeps them in `data` next to `Texpile.exe` and files a project on the same drive by its path from the drive's root, so they follow the drive to another computer whatever letter it gets, and stay found if the Texpile folder moves on the drive. In a shared session the host keeps them, guests' edits included; a guest keeps none.

## Branches

The branch name at the top of Source Control says which branch you are on. Texpile does not create or delete branches: it cannot merge one branch into another, and a checkout rewrites the working tree, so that is left to git for anyone who works that way. To go back to a branch, for instance after a checkout in the terminal left you on another one or on an earlier commit (the name then reads HEAD detached at 1a2b3c4, with the commit's hash), choose Checkout to… in the command palette and pick it. A checkout carries uncommitted changes over when it can. When it would overwrite them, Texpile names the files and offers Commit & Checkout, which commits your staged changes and the files in the way on the branch you are leaving (WIP before checkout to draft, for a branch named draft), then checks out the other; check out the first branch again to find them there. Other changes you unstaged are not committed, and the checkout carries them over.

## Publish and sync

Once the project has a commit, Publish Branch appears beside the branch name. It pushes the branch somewhere else: to a new GitHub repository, private or public, created for it (Publish to GitHub); to a remote the repository already has; or, under Add remote from URL, to any other repository by its URL, such as an empty one on GitLab, Bitbucket, Codeberg or your university's server. With exactly one remote already set up, Publish Branch goes straight there.

After that the button becomes Sync. Sync pulls the commits made elsewhere and pushes yours, and it shows how many commits go each way. When both sides have new commits, Sync merges them, and git writes the merge commit's message (Merge remote-tracking branch 'origin/main'). When both sides changed the same lines of a file, Sync aborts the merge (git merge --abort), names the files, and offers Merge to merge and resolve the conflicts; Cancel changes nothing. When uncommitted changes would be overwritten by the merge, Sync stops before anything changes and offers Commit & Sync, which commits your staged changes and the files in the way (WIP before sync) and then syncs. Changes you unstaged are not committed or pushed, unless they are among the files in the way.

Texpile fetches from the remote on its own every three minutes while its window is in front, as VS Code's autofetch does, and says when new commits arrive (Your branch is behind 'origin' by 2 commits.), with Sync Changes to pull them before you start editing. Autofetch never asks you to sign in: it uses a GitHub sign-in or saved password you already have, and when it would need one it stops until your next Sync or Fetch works. Turn it off with Autofetch in Preferences, under Version Control; Fetch in the command palette then fetches once, without pulling anything. Refresh only rereads this computer.

## Merge conflicts

Merge pulls in the other side's commits and leaves a conflict in the file at each place where both sides changed the same lines. The file opens in the source editor at the first conflict, whichever editor you were using: the current change (ours) is labelled (Current Change) and tinted one colour, the incoming change (theirs) is labelled with where it came from, as in origin/main (Incoming Change), and tinted another, and above each conflict are Accept Current Change, Accept Incoming Change and Accept Both Changes. The words that differ between the two changes are highlighted in both, so a changed word in a long paragraph stands out. Each choice is one step in the undo history. The bar above the file counts what is left (2 Conflicts Remaining), Previous Conflict and Next Conflict go from one to the next, and Accept All resolves every conflict in the file the same way at once: Accept All Current, Accept All Incoming or Accept All Both. You can also edit the lines yourself; a conflict counts as resolved once its `<<<<<<<`, `=======` and `>>>>>>>` lines are gone, and a file still holding any one of those lines is not resolved, as in VS Code: a stray `=======` would otherwise print in the PDF. While a file has conflicts, the margin shows no change marks in it. A file's tab carries a merge mark while conflicts in it are waiting. A file with no conflicts to click is marked in Source Control instead: Deleted By Them or Deleted By Us when one side deleted it, and Both Modified for a figure, a PDF or any other file that is not text. Click it and Texpile asks which to keep (Keep Our Version, Keep Their Version, or Delete File), as VS Code does for a deleted file; Complete Merge waits until each one is answered. Before, git kept our side of a figure without a word.

Source Control lists the files under Merge Changes, and marks each one Resolved once every conflict in it is resolved. Complete Merge commits the result as one merge commit, which Sync then pushes. Abort Merge runs git merge --abort, which reconstructs the pre-merge state; conflicts resolved so far are lost.

| During a merge | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| Click a file   | Opens it in the source editor at its first conflict.                        |
| Complete Merge | Commits the merged files as one merge commit. Waits until each is Resolved. |
| Abort Merge    | Runs git merge --abort, back to the state before the merge started.         |

A merge started in the terminal gets the same Complete Merge and Abort Merge. A rebase or cherry-pick in progress there is shown in the panel, and is continued or aborted in the terminal.

## Clone a repository

To work on a project that is already on GitHub or elsewhere, choose Clone Repository on the start screen or in the File menu. Paste its URL: the repository's page, a page inside it, its clone URL, or a `git clone` command from a README all work, and an Overleaf project page is turned into its git URL. Choose the folder name and where it goes; the clone shows its progress, asks you to sign in if the repository is private, and opens the folder when it is done.

## Signing in

Texpile signs in with whatever git already uses: Git Credential Manager, the macOS keychain, `gh auth setup-git`, or an SSH key. When none of those has an answer, git's question appears in the window instead of failing: a username and password, an SSH key's passphrase, or whether to trust a server it has not seen before (Are you sure you want to continue connecting?). For GitHub, use a personal access token with the repo scope as the password. A credential manager keeps it after it works, so it is asked for once. Without one, Texpile keeps the username and password (or token) in your system keychain once they have worked, and forgets them if they stop working; Forget Saved Git Credentials in the command palette removes them. On Linux this needs a keyring (GNOME Keyring or KWallet); without one they are kept in memory until you quit Texpile, never written to disk, so you are asked once per session rather than on every Sync.

You can also sign in to GitHub in your browser, as VS Code does. Choose Sign In to GitHub in the command palette, or Sign In with GitHub when git asks for your GitHub username or token. Texpile shows a one-time code, and Copy & Continue to Browser copies it and opens GitHub's page so you can paste it there. From then on your GitHub account answers git's questions for Sync and Publish. The sign-in is kept in your system keychain, and Sign Out of GitHub in the command palette ends it. If GitHub stops accepting it, the next push, pull or fetch asks again.

A new GitHub repository is published over HTTPS. A project whose remote is already an SSH URL keeps using your SSH key.

If you push to someone else's GitHub repository, GitHub refuses it, and Texpile says so: ask the repository owner to add you as a collaborator.

The first time you commit on a computer where git has no user.name and user.email, Texpile asks for them (Author identity unknown) and saves them to your global Git config, for all your projects.

## When something goes wrong

A failed commit, sync or publish says what happened in git's words, and Show Command Output opens Command Output, the output of the failed git command, with Copy for a bug report. Buttons say Committing Changes…, Synchronizing Changes… or Publishing Branch… while they work, and a thin bar runs across the top of Source Control while git is busy.

- **The folder belongs to another account.** A project on a USB or network drive, or one copied from another user, may belong to a different account on your computer. Git will not work in it until you mark it as safe, because a repository's Git config and hooks can run programs. Source Control says the repository is potentially unsafe and offers Manage Unsafe Repositories, which asks first (Mark as Safe) and then adds the folder to `safe.directory` in your global Git config.
- **A folder full of untracked files.** A folder of 200 or more untracked files, such as a data dump or a Python environment, is one row that says how many files it holds. It starts unstaged, and its menu has Add to .gitignore. Past 2,000 changes the list shows only the first 2,000 and says Too many changes were detected.
- **GitHub found a secret.** GitHub's push protection rejects a push that contains a secret (what looks like a password, token or key), and Texpile names the file and line. To push, remove the secret from the commit: a commit not pushed yet still holds it, so removing it from the file is not enough. If it is not really a secret, Open on GitHub lets you allow it.
- **A protected branch.** A protected branch rejects pushes. Push to another branch and open a pull request, or ask the repository owner for push access.
- **Another git process is running.** When another git process holds the repository's lock, Texpile tries again, as VS Code does, up to ten times over about twenty seconds, then says to remove the lock file in the .git folder if a crashed git process left it behind.

> [!NOTE]
> This covers the everyday loop, from the first commit to GitHub. For merging branches and rewriting history, use the built-in terminal. It needs git installed.

[Installing git](installation/git.md)
