---
nav: Shared sessions
description: Messages in shared sessions whose fix is not in the message itself, and what to do.
order: 4
---

# Troubleshooting shared sessions

| You see                                                                 | Fix                                                                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "That code does not look right."                                        | Paste the whole join link instead.                                                                          |
| "No session found for this code."                                       | The session ended or the code is wrong. Check with the host, and use the same **Relay Server** as the host. |
| "…cannot share a session with this version", "needs Texpile … or newer" | Whoever is on the older version updates Texpile. The browser version is always current.                     |
| "If Texpile did not open"                                               | Click **Continue in Browser**. In the portable version, enter the code on its start screen instead.         |
| **Shared Session** is greyed out                                        | Open the folder as a project. The web version cannot host.                                                  |
| "Too large to co-edit, shared view-only"                                | Files over 2 MiB. Guests can read them but not edit them.                                                   |
| A file does not appear for guests                                       | See [what is shared](../collaboration/README.md#what-is-shared).                                            |
| A guest's compile request does nothing                                  | A compile is running. Ask again after it ends.                                                              |
| "Reconnecting...", "The host lost connection"                           | Wait. Edits merge when the connection is back.                                                              |
| "The connection to the session was lost."                               | Click **Back to Home** and join again with the code.                                                        |
| "No compiled PDF yet."                                                  | Click **Request Compile**. No PDF is shared while the host uses the Typst live preview.                     |
| "The host is editing this file in visual mode."                         | Ask the host to switch to the source editor or another file. Until then the file is read-only for you.      |
| No Editing and Suggesting picker                                        | Ask the host to update Texpile.                                                                             |
| A rename or new folder did nothing                                      | The name is already taken. Use another name.                                                                |
