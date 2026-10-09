---
nav: AI Assistant
description: Use an AI agent you install yourself to chat in the Agent tab, rewrite selected text with Refine, or read your editor over MCP.
blurb: The Agent tab, Refine, and the MCP server.
icon: bot
order: 32
section: AI and integrations
---

# AI Assistant

Texpile includes no AI. It works with an agent you install and sign in to yourself: chat with it in the [Agent tab](agent-panel.md), rewrite a selection with [Refine](refine.md), or let it read your editor through the [MCP server](mcp.md). Desktop app only.

## Set up an agent

Install the agent and sign in outside Texpile, then pick it in `Preferences › AI Assistant`. The Agent tab and Refine each have their own choice.

![Preferences, AI Assistant, with the Refine with and Agent tab choices](../../landing/src/lib/assets/showcase/docs/review/prefs-ai-assistant.png)

| Agent           | Agent tab | Refine | Sign in from a terminal |
| --------------- | --------- | ------ | ----------------------- |
| Codex           | Yes       | Yes    | `codex login`           |
| Claude Code     | Yes       | Yes    | Run `claude`            |
| OpenCode        | Yes       | No     | `opencode auth login`   |
| GitHub Copilot  | Yes       | No     | Run `copilot`           |
| Gemini          | Yes       | No     | Run `gemini`            |
| Antigravity CLI | No        | Yes    | Its own sign-in (`agy`) |

You can also enter your own command. For the Agent tab it must speak the Agent Client Protocol, such as `opencode acp`. For Refine it reads a request and prints the new text, such as `ollama run llama3.1`.

**Not found** means Texpile cannot find the agent. Add its folder in `Preferences › Toolchain › Folders`, then reopen Preferences.

What each feature sends is in [Privacy](../reference/privacy.md).
