---
description: Real-time collaboration in Texpile: share a folder and edit it with others live, end to end encrypted, with no account. Guests join with a code, in Texpile or in a browser.
blurb: Edit a folder with other people in real time, end to end encrypted, with no account.
icon: users
order: 9
section: Editor
---

# Real-time collaboration

A shared session lets several people edit the same folder at once, in either editor. Sessions are end to end encrypted, and there is no account.

| Where to find it | Path                  | Note                                                                                           |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| Menu             | File › Shared session | Share a folder of your own and get a code.                                                     |
| Start screen     | Join session          | Join someone else's with the code.                                                             |
| Link             | join.texpile.com      | The share dialog gives a link. It opens in Texpile, or in the browser with nothing to install. |

![Two people editing the same document, with each other's cursors visible](../landing/src/lib/assets/showcase/editor-collab.webp "Two people editing the same document, with each other's cursors visible")

The host compiles with their own toolchain, and guests see the PDF and the compile problems update live. Actions that belong to the host's machine, such as starting a compile, are left out of a guest's menus.

> [!NOTE]
> Everything else in Texpile works offline. This is the one feature that uses the network.
