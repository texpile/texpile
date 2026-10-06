---
nav: Git
description: Messages in Source Control, GitHub and Version History whose fix is not in the message itself, and what to do.
order: 3
---

# Troubleshooting Git

When something fails, **Show Command Output** shows what git said.

## Setup

| You see                                                           | Fix                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "Git not found. Install it to use source control."                | [Install git](../installation/git.md).                                                                                            |
| "A Git repository was found in the parent folders…"               | Your folder is inside another repository. **Open Repository** uses that one. **Initialize Repository** gives this folder its own. |
| "This Git repository may be unsafe because another user owns it." | If you trust the owner: **Manage Unsafe Repositories** › **Mark as Safe**.                                                        |
| No colors, counts or marks in the file tree                       | Open Source Control and answer the question about the parent repository.                                                          |

## Commit

| You see                              | Fix                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| "There are no changes to commit."    | Stage at least one file.                                                                                |
| "Failed to sign the commit."         | Fix commit signing in your git settings. Texpile has none of its own.                                   |
| "There are merge conflicts…"         | See [Merge conflicts](../version-control/conflicts.md).                                                 |
| "Too many changes were detected…"    | Add large folders to `.gitignore`.                                                                      |
| A folder shows **N untracked files** | Folders with 200 or more new files are not staged for you. Add the folder to `.gitignore`, or leave it. |

## Sync and push

| You see                                             | Fix                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "Your local changes would be overwritten by merge." | Choose **Commit & Sync**.                                                                                         |
| "The branch "…" has no remote branch."              | Choose **Publish Branch**.                                                                                        |
| **HEAD detached at …** and Sync is off              | Pick a branch with Checkout to… in the [command palette](../command-palette.md).                                  |
| "Failed to authenticate to git remote"              | Sign in again. See [GitHub](../version-control/github.md).                                                        |
| "…rejected because the branch is protected."        | Texpile cannot create branches. Push to another branch from the terminal, or ask the owner for access.            |
| "…push protection found secrets in…"                | Remove the secret from the commit, not only from the file. If it is not a secret, **Open on GitHub** to allow it. |
| Autofetch stopped                                   | Sync or Fetch once and sign in.                                                                                   |

## Publish and clone

| You see                                                               | Fix                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "The GitHub token is missing the "repo" scope…"                       | Make a token with the `repo` scope. A fine-grained token needs the Administration permission. |
| "The "…" repository was created on GitHub, but the push to it failed" | Choose **Publish Branch** again and pick that remote.                                         |
| "Clone succeeded, but checkout failed"                                | A file has a name your system does not allow, or a Git LFS file did not download.             |
| "A submodule could not be cloned"                                     | The rest was cloned. Texpile does not manage submodules.                                      |

## Branches

| You see                                                | Fix                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| "Your local changes would be overwritten by checkout." | Choose **Commit & Checkout**.                                  |
| "No other branches"                                    | Texpile cannot create a branch. Make one in the terminal.      |
| "Could not read the Git history"                       | Click Refresh. If it stays, run a git command in the terminal. |

## Version History

| You see                                   | Fix                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "No copies of this file yet."             | Save the file, and check that Keep version history is on in Preferences.                                  |
| "No deleted files here have copies left." | The copies aged out, or the file was over 1 MB. See [limits](../version-control/local-history.md#limits). |
| A guest has no copies                     | Only the host keeps copies.                                                                               |
