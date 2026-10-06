---
nav: MCP server
description: Turn on Texpile's local MCP server so an AI assistant such as Claude Code can read your editor, see compile errors, work with comments and suggest edits.
order: 4
---

# MCP server

Lets an AI assistant such as Claude Code read your editor and leave comments and suggestions. Off until you turn it on.

> [!REQUIRES] an AI assistant that supports MCP

1. Turn on **MCP server** in `Preferences › AI Assistant`. The line under it reads "Listening on 127.0.0.1:7317".
2. Click **Show Instructions** and paste the message into your assistant.

![The Connect an Assistant dialog, with a message to paste into your assistant](../../landing/src/lib/assets/showcase/app/mcp-modal.png)

If the assistant cannot add it, add a server named `texpile` at `http://127.0.0.1:7317` in its MCP settings. Agents in the [Agent tab](agent-panel.md) get the same tools without the server.

The assistant changes your text only through [suggestions](../comments/suggesting.md). While the server is on, any program on your computer can connect without a password.

## Change the port

"Not running: …" means another program uses port 7317. Quit Texpile, set `"mcpPort": 7400` (or another free port) in `settings.json` in Texpile's app data folder, start Texpile, and give your assistant the new instructions.
