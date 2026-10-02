---
nav: Agent tab
description: Chat with Codex, Claude or another AI agent from the bottom panel.
blurb: Chat with an AI agent that edits the open folder.
icon: bot
order: 3
---

# Agent tab

The Agent tab in the bottom panel is a chat with an AI agent installed on your computer, such as Codex or Claude. The agent edits files in the open folder, and you review its changes in the editor.

| Where to find it | Path                                   | Note                                                                    |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Tab              | Bottom panel › Agent                   | Terminal › Show Terminal opens the bottom panel.                        |
| Setting          | Preferences › AI Assistant › Agent tab | The agent the tab works with, or a command for an agent of your choice. |

## Setting it up

Install the agent and sign in once in its own program:

| Agent          | Program  | Sign in                               |
| -------------- | -------- | ------------------------------------- |
| Codex          | codex    | `codex login`                         |
| Claude         | claude   | Run `claude` and follow its sign-in.  |
| OpenCode       | opencode | `opencode auth login`                 |
| GitHub Copilot | copilot  | Run `copilot` and follow its sign-in. |
| Gemini         | gemini   | Run `gemini` and follow its sign-in.  |

Choose an agent on the welcome screen or in Preferences. Until you do, the tab asks for one and starts nothing. To switch agents later, use the menu at the right end of the tab strip. If Texpile does not find an installed agent, add its folder under Toolchain › Folders.

Texpile never sees your sign-in. If the agent is not signed in, the tab shows the command to run and a button that opens a terminal.

For another agent that speaks the Agent Client Protocol, choose Custom agent in Preferences and enter its command, for example `opencode acp`.

Choosing Off in Preferences removes the tab and stops the agent.

## Working with the agent

- Type in the box and press Enter. Shift+Enter starts a new line. The open file goes with each message.
- Texpile saves your edits before each message.
- The agent can read and edit files and run commands in the open folder. When it asks permission, the question appears above the box and the tab shows a count until you answer.
- The menus in the box are the agent's own settings, such as its model.
- Finished steps fold into one line. Click it to see each step.
- Stop ends the turn. The plus button at the right end of the tab strip starts a new chat.

## Reviewing changes

When a turn ends, Changed by lists the files the agent changed. Click a file to see its changes, each with Revert Change. To undo a whole file, use Revert to Before in the row's menu. A deleted file has Restore File instead.

The agent writes to files directly. If an open file has unsaved changes, Texpile asks which version to keep. The Before copies stay in memory until the window closes.

> [!NOTE]
> What you type and what the agent reads go to that agent's service, under your account. Agents that support MCP, such as Codex and Claude, also get Texpile's tools for the open tabs, the caret, compile errors and suggested edits. These tools work without the MCP server setting, and only the agent in the tab can use them. In a shared session, only the host has the Agent tab.
