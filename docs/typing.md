---
nav: Typing and selecting
description: Smart quotes and dashes, Tab in lists and tables, selecting a whole block, and other typing behavior in Texpile's visual editor.
blurb: Smart quotes, Tab, and selecting whole blocks in the visual editor.
icon: keyboard
order: 23
section: Editor tips
---

# Typing and selecting

A few things the editor does as you type. In the visual editor, Backspace straight after one undoes it.

## Quotes and dashes

In LaTeX and Typst:

| You type   | You get      |
| ---------- | ------------ |
| `"` or `'` | Curly quotes |
| `--`       | En dash (–)  |
| `---`      | Em dash (—)  |
| `...`      | Ellipsis (…) |

## Tab

In a table cell, Tab moves to the next cell. In a list, it indents the item. Shift Tab goes back.

In a LaTeX paragraph, Tab changes whether its first line is indented.

## Select a whole block

Ctrl-click (Cmd-click on macOS) a paragraph, an equation, a table or any other block to select all of it. Ctrl-click again to select the block around it, such as the whole list. A click on the block handle beside a block selects it too.

Ctrl A in a table cell or a caption selects just that field. Press it again for the whole document.

## In an equation

Press Tab or Ctrl Space to find a symbol by its name or by what it means, such as `not eq` or `arrow right`. Enter inserts it. With an empty slot ahead, Tab moves to that slot first.

## Delete a figure or an equation

Next to a figure, the first Backspace selects it and the second deletes it. An empty equation turns red first, then goes.

## Math typing helpers

The source editor has three helpers for the formula around the cursor. They are off by default. Turn them on in Preferences › Editor › Source editor.

| Helper              | What it does                                                                                                                                                       | Default |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Auto-fraction       | In LaTeX and Markdown math, `a/` becomes `\frac{a}{}` with the cursor below. `x^2/`, `\alpha/` and `(a+b)/` work the same way. A second `/` takes it back to `a/`. | Off     |
| Tab out of brackets | In math, Tab moves past the next `)`, `]` or `}`, then out of the formula. At the start of a line Tab still indents.                                               | Off     |
| Matrix keys         | In `matrix`, `pmatrix`, `array`, `align` and similar environments, Tab adds `&` and Shift+Enter starts a row. In a Typst `mat(…)`, they add `, ` and `; `.         | Off     |
