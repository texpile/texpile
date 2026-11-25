---
nav: Refine selected text
description: Rewrite selected text with an AI agent on your computer, and get the result as a suggestion.
order: 3
---

# Refine selected text

Rewrite a selection with an AI agent. The result arrives as a [suggestion](../comments/suggesting.md) under the agent's name, and your text changes when you accept it.

> [!REQUIRES] an [AI agent](README.md#set-up-an-agent) installed outside Texpile

Select text, then right-click › **Refine with {agent}** and pick an action. With **Toolbar on selection** on in `Preferences › Editor`, the selection toolbar also has a Refine button.

![The right-click menu on selected text with the list of Refine actions](../../landing/src/lib/assets/showcase/docs/review/refine-menu.png)

**Match writing style** rewrites the passage to match the text around it. **Write an Instruction** does what you type.

Works in LaTeX, Typst, Markdown, BibTeX and plain text, in a folder open in the desktop app. Refine is off for guests and while you host a shared session. The agent also gets the text around the selection: see [Privacy](../reference/privacy.md).

If you see "The text from {agent} was not used", the result broke a rule, and the note names it. In LaTeX, Texpile drops a result that cites a key missing from your bibliography or removes a `\label`.
