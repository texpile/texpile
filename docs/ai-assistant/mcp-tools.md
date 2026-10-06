---
nav: MCP tools
description: Reference for every tool the Texpile MCP server offers.
order: 5
---

# MCP tools

The tools an assistant gets from the [MCP server](mcp.md). Every tool except `get_editor_state` takes an optional `root`, the project folder to act on. Without it, the tool acts on the window you last focused.

| Tool                 | What it does                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `get_editor_state`   | Every open window: folder, main file, active file, view, tabs, unsaved changes, cursor, selection, live preview. |
| `get_unsaved`        | The text of the active file, if it has unsaved changes.                                                          |
| `get_diagnostics`    | Compile errors and warnings with file and line, and whether a compile is running.                                |
| `get_compile_config` | Compile command, format, engine, output folder, PDF and log paths.                                               |
| `open_file`          | Opens a file. With a `line`, in the source editor.                                                               |
| `show_diff`          | The Diff view against the last commit, in a git repository.                                                      |
| `set_view_mode`      | `visual`, `source` or `diff`.                                                                                    |
| `synctex_to_line`    | Shows where a line appears in the PDF. For Typst, moves the live preview, which must be running.                 |
| `set_main_file`      | Sets the main file (`.tex` or `.typ`). Without `path`, clears it.                                                |
| `compile`            | Starts a compile and returns at once. Poll `get_diagnostics` until it finishes.                                  |
| `set_output_paths`   | Changes the output folder, PDF path or log path. An empty string clears one.                                     |
| `get_comments`       | Comment threads with the line each sits on. A thread whose text cannot be found reads as detached.               |
| `add_comment`        | Adds a thread on a quote that appears exactly once in the file.                                                  |
| `reply_to_comment`   | Replies to a thread.                                                                                             |
| `resolve_comment`    | Resolves a thread. `resolved: false` reopens it.                                                                 |
| `reanchor_comment`   | Moves a thread onto new text.                                                                                    |
| `suggest_edit`       | Puts a change into the open file as a suggestion.                                                                |

Comment tools take `by`, the author name, default "AI assistant". `prefix`, `suffix` and `line` pick between copies of a quote.

`suggest_edit` is refused when the file is not the one open in the editor, the quote does not match exactly once (markup included), the replacement equals the quote, or you host a shared session. In LaTeX it is also refused if the new text cites a key your bibliography lacks or removes a `\label`.
