---
nav: AI assistants (MCP)
description: Texpile runs a local MCP server so Claude Code, Codex, and other assistants can read your editor state and compile errors and drive the editor.
blurb: Let Claude Code or Codex read your editor state and drive the app, on your computer.
icon: bot
order: 2
---

# AI assistants (MCP)

Texpile runs a local MCP server, so an AI assistant can see what you are working on and drive the editor. It is off until you turn it on.

| Where to find it | Path                     | Note                                                                                         |
| ---------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| Setting          | Preferences › MCP server | Preferences opens from the start screen, and from File › Preferences… once a folder is open. |

![The Connect an assistant dialog, with setup commands for Claude Code and Codex](../../landing/src/lib/assets/showcase/app/mcp-modal.png 'The Connect an assistant dialog, with setup commands for Claude Code and Codex')

## Setting it up

Preferences shows a ready-made command for Claude Code and a config entry for Codex, with the real port filled in.

```bash
claude mcp add --transport http texpile http://127.0.0.1:PORT
```

```toml
[mcp_servers.texpile]
url = "http://127.0.0.1:PORT"
```

## What an assistant can do

- Read the editor state: the open file, the current view, and the selection.
- Read content you have typed but not saved yet.
- Read the current compile errors and warnings.
- Open a file, show a diff, or switch between the visual, source, and diff views.
- Show a given source line in the PDF.
- Run a compile.

> [!NOTE]
> None of these edit your files. The server is reachable only from your own computer, and only the host of a shared session has it. What your assistant does with what it reads is between you and your assistant.
