---
description: Draw TikZ pictures in Texpile's figure editor with tools, an inspector and a library, and see every canvas edit written into the .tex file.
order: 5
---

# Drawings

A `tikzpicture` opens in the figure editor. Draw on a canvas and Texpile writes the TikZ into your `.tex` file.

## The picture in the paper

In the visual editor a `tikzpicture` shows as a card with its last drawing. A picture that was never drawn shows a placeholder with a summary of what it holds.

Hover the card and click **Edit figure** (the pencil) to open the picture in a figure tab next to the paper.

## The figure tab

Draw with the tools: boxes, circles, lines, arrows, text and more. Move and stretch shapes on the canvas. Style the selected shape in the inspector on the right. Add a ready-made element from the library.

Every canvas edit is written into the TikZ source in the `.tex` file, in place. The rest of the file stays as it was.

## Undo and redo

The file has one history. Undo and redo in the figure tab go through it.

Undoing in a figure tab a change that was made outside the figure asks first: "Undo Change Outside the Figure?".

## The picture in the source

The source editor marks an open figure. The picture's lines are tinted and a chip "Figure N is open" sits on it. Click the chip to show the figure tab. The statement you are editing in the figure is highlighted.

## LuaLaTeX

The drawing comes from your own LuaLaTeX. Texpile starts it when a figure tab opens and keeps it running while a figure tab is open. It stops a minute after the last figure tab closes.

If LuaLaTeX is missing, the figure tab says "Figures need LuaLaTeX." and Texpile offers its usual help to install a TeX distribution. See [Install a TeX distribution](../installation/latex/README.md).

## Pictures in other files

A picture in a file that the main file loads with `\input` is drawn with the main file's preamble. A new shape that needs a TikZ library adds `\usetikzlibrary` to the main file's preamble.

## Unfinished and deleted pictures

When the picture's source is unfinished, for example a missing `\end{tikzpicture}`, the figure tab asks you to finish it and offers **Show in source**.

When the picture is deleted from the source, the tab says "This figure was deleted."

## `.tikz` files

A `.tikz` file opens in the figure editor too. The **Visual** and **Source** switch changes between the canvas and the code.

## Saved drawings

Texpile keeps the drawings in `.texpile/figures`. The paper shows them while LuaLaTeX is stopped. That folder stays out of Git.
