---
nav: Agent tab
description: Chat with Codex, Claude or another AI agent in the bottom panel or a side panel, and review or revert the files it changed.
order: 1
---

# Agent tab

Chat with an AI agent that reads and edits files in the open folder and runs commands there. It uses the agent picked in `Preferences › AI agent`. The agent's name at the right end of the bottom panel's tabs opens that page.

The robot button at the top of the PDF, or in the title bar while the PDF is closed, opens the tab with the cursor in the message box. `Ctrl Alt I` does the same (`Control Cmd I` on macOS). Click the button again to hide the bottom panel.

> [!REQUIRES] an [AI agent](README.md#set-up-an-agent) installed outside Texpile

- The open file, or the selected lines, go with each message. Click **Leave out of the message** to send your text alone.
- Paste or drop an image (PNG, JPEG, GIF or WebP) if the agent takes images.
- Type `/` at the start of the box for the agent's own commands. A command runs when it is the whole message.
- The ring beside **Send** fills as the chat uses up the agent's context. Hover it for the token count, or click it and choose **Compact Now** to sum up the chat before it fills. It shows once the agent reports it, which Codex and Claude do.
- When the context is nearly full, the agent compacts it on its own: it sums up the chat so far and goes on from that summary. **Context compacted** marks the spot. Click it to read the summary, when the agent sends one. **New Chat** starts over instead.
- Changing folder starts a new chat.

## Side panel

Click **Move to Side Panel** beside the agent's name to show the Agent tab in a column at the right edge of the window. The document and the PDF keep their full height. Drag the column's left edge to resize it. The Agent button and `Ctrl Alt I` show and hide it. **Move to Bottom Panel** in its header puts the tab back. Texpile remembers the place and the width.

## Review and revert

When a turn ends, **Changed by {agent}** lists the changed files, including changes from commands the agent ran. Click a file to see its changes in the editor. **Revert Change** undoes one change. **Revert to Before {agent}**, in the row's menu, undoes the whole file.

Revert covers text files up to 1 MB and works until you close the window.

## Messages

| You see                  | Fix                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| {agent} is not signed in | Run the command shown in a terminal. **Open Terminal** opens one.                                          |
| {agent} was not found    | Install it, or add its folder in `Preferences › Programs & Compiler › Other folders`. Click **Try Again**. |
| {agent} stopped          | The note shows its last message. Click **Try Again**.                                                      |
