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
- Read the review comments, with the line each thread sits on now.
- Reply to a thread, resolve it, or re-attach it to new text after an edit.
- Leave review comments of its own. The author shown is the name the assistant gives, not yours.

> [!NOTE]
> None of these edit your files. The comment tools write only the comment log in the `.texpile` folder. The server is reachable only from your own computer, and only the host of a shared session has it. What your assistant does with what it reads is between you and your assistant.

## Comments and assistants

Comments are pinned to the text they quote, so an assistant that rewrites a commented sentence with its own file tools would leave the thread without a place. With the comment tools it can read the threads on a file before editing, reply with what it changed and resolve the thread, or re-attach the thread to the new wording. A thread whose text is gone for good stays in the panel as detached, with the reply explaining why. A thread whose surrounding words changed is reported as weak, so the assistant checks it is on the sentence meant before acting on it.
