---
description: Review comments in Texpile: select text and leave a comment, reply and resolve, in the visual editor or in source, on LaTeX, Typst, and Markdown.
blurb: Select anything and leave a comment. Threads follow the text as it changes.
icon: message-square
order: 7
section: Editor
---

# Comments

Select anything and leave a comment. Threads attach to the words, so they follow the text as it changes. Reply, resolve, and filter to the current file from the Comments panel.

| Where to find it | Path                                | Note                                            |
| ---------------- | ----------------------------------- | ----------------------------------------------- |
| Add one          | Select text › right-click › Comment | Also on the selection toolbar, in both editors. |
| Panel            | Comments                            | A tab in the panel below the editor.            |

![A comment thread on a selected sentence, with a reply, in the Comments panel below the editor](../landing/src/lib/assets/showcase/app/comments-panel.png 'A comment thread on a selected sentence, with a reply, in the Comments panel below the editor')

Comments are stored in the project folder, so they travel with it, and nothing is written into the document itself. Texpile only tracks edits made in Texpile, so a file changed in another editor can leave a comment detached. A comment with nowhere to sit (its text is gone, its file was deleted, or it is in the preamble while the visual editor is open) keeps its thread in the Comments panel with a badge. A comment whose text was found but whose surrounding words changed gets a Check placement badge: if the same sentence appears more than once in the file, the comment may now sit on another copy. Guests in a shared session can read and write comments.

An AI assistant connected over MCP can read the threads, reply and resolve, re-attach a thread to text it rewrote, and leave comments of its own. See [AI assistants (MCP)](integrations/mcp.md).
