---
description: The PDF pane: invert colors, presentation mode, pop-out, two views, save a PDF, check colors for color vision deficiency, and reload a PDF built outside Texpile.
order: 4
---

# PDF and preview pane

The compiled PDF beside the editor. **Show PDF** in the title bar opens the pane, and Layout › **PDF Preview** or the small button on the divider shows and hides it.

![The PDF Preview pane before the first compile, saying Compile to preview the PDF](../../landing/src/lib/assets/showcase/docs/app/pdf-pane-empty.png)

- The "…" menu holds the zoom, **Rotate**, **Invert colors**, **Simulate color vision**, **Presentation** and **Save PDF**.
- **Invert colors** changes the screen only. The dark and light themes each remember their own choice.
- In presentation mode, click for the next page and Shift click or right-click for the previous one.
- The pop-out button at the right end of the bar, or Layout › **Open preview in its own window**, moves the pane to its own window.

## Two views

Layout › **Split the preview** shows the PDF twice, one view above the other. See [Split view](../split-view.md).

## Color vision check

"…" › **Simulate color vision** shows the page as seen with protanopia, deuteranopia, tritanopia or achromatopsia. Only the screen changes, never the PDF. Works in the PDF pane, the LaTeX live preview and the Typst preview.

## A PDF built outside Texpile

A PDF built by another program, for example `latexmk -pvc` or an agent, reloads on its own when it is newer than the one on screen. If your build writes elsewhere, set its path in the compile settings under **Advanced: Output Paths**.
