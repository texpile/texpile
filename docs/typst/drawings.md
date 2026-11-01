---
description: Draw CeTZ pictures in a Typst document with Texpile's figure editor and see every canvas edit written into the .typ file.
order: 5
---

# Drawings

A `#cetz.canvas` picture in a `.typ` file opens in the figure editor. It works as [drawings in LaTeX](../latex/drawings.md) do: the card with **Edit figure**, the tools, the inspector, the library, one undo history, and the "Figure N is open" chip in the source. Every canvas edit is written into the CeTZ code in place.

## tinymist

The drawing comes from tinymist, the program Texpile uses for Typst. Texpile starts it when a figure tab opens.

If tinymist is missing, the figure tab says "Typst figures need tinymist." and Texpile offers to install it. See [Install tinymist for Typst](../build-and-preview/toolchain.md#install-tinymist-for-typst).

## Saved drawings

Texpile keeps the drawings in `.texpile/figures`. The document shows them from there. That folder stays out of Git.
