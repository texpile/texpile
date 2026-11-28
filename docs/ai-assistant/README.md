---
nav: AI Assistant
description: Use an AI agent you install yourself to chat in the Agent tab, rewrite selected text with Refine, turn a picture into LaTeX, or read your editor over MCP.
blurb: The Agent tab, Refine, Convert to LaTeX, and the MCP server.
icon: bot
order: 32
section: AI and integrations
---

# AI Assistant

Texpile includes no AI. It works with an agent you install and sign in to yourself: chat with it in the [Agent tab](agent-panel.md), rewrite a selection with [Refine](refine.md), turn a picture into source with [Convert to LaTeX](convert-to-latex.md), or let it read your editor through the [MCP server](mcp.md). Desktop app only.

## Set up an agent

Install the agent and sign in outside Texpile, then pick it from the **Agent** menu in `Preferences › AI agent`. The Agent tab, Refine, [Proofread with AI](../spell-check.md#proofread-with-ai) and Convert to LaTeX all use the one agent picked there. **Test agent**, under the menu, sends it a short request and shows how long it took to answer.

| Agent       | Sign in from a terminal | Plan                                               |
| ----------- | ----------------------- | -------------------------------------------------- |
| Claude Code | Run `claude`            | Claude plan                                        |
| Codex       | `codex login`           | ChatGPT plan                                       |
| OpenCode    | `opencode auth login`   | Any model: Ollama, LM Studio, a university gateway |
| Gemini      | Run `gemini`            | Google account                                     |
| Copilot     | Run `copilot`           | GitHub Copilot plan                                |

A local model or your own API key runs through OpenCode. See [Other models and API keys](other-models.md).

**Custom command** runs any command that speaks the Agent Client Protocol, such as `goose acp`. Type the command in the box under the menu.

The agent keeps running while you write and closes after 15 minutes idle. For Refine, Proofread with AI and Convert to LaTeX its tools are turned off, and it answers from the text Texpile sends.

The menu lists the agents Texpile finds. Each agent it does not find has an **Install** item at the end of the menu, which opens that agent's install page. If the agent is installed in a folder Texpile does not search, add that folder in `Preferences › Programs & Compiler › Other folders` and reopen Preferences.

## Models

**Models** picks the model the agent runs for each task. The list comes from the agent picked above. **Agent default** uses the agent's own choice.

| Task             | Default for Claude Code | Used for                                                                 |
| ---------------- | ----------------------- | ------------------------------------------------------------------------ |
| Proofread        | Haiku                   | Proofread with AI, which runs often                                      |
| Refine           | Sonnet                  | Refine                                                                   |
| Convert pictures | Opus                    | Convert to LaTeX and Paste as LaTeX. A strong model draws diagrams best. |
| Agent tab        | Agent default           | The starting model of a new chat. Each chat can change it.               |

## Turn off AI

Turn off **Use AI features**, at the top of `Preferences › AI agent`, to hide Refine, Proofread with AI, Convert to LaTeX, the Agent tab and the MCP server and start no agent. Turn it on to bring them back with your earlier choices. The MCP server stays off until you turn it on again.

What each feature sends is in [Privacy](../reference/privacy.md).
