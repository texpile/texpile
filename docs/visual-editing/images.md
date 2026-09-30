---
nav: Images
description: Add and edit figures in Texpile's visual editor: drag and drop, paste from the clipboard, resize handles, captions, numbering, a custom label, and what differs in Typst and Markdown.
blurb: Drag, paste, or insert a figure, then resize, caption, and number it on the page.
icon: image
order: 2
---

# Images

A figure shows on the page as the image itself, in every format.

| Where to find it | Path                                                          | Note |
| ---------------- | ------------------------------------------------------------- | ---- |
| In the editor    | Drag a file onto the editor, or paste one from your clipboard |      |
| Menu             | Insert › Image…                                               |      |

## Resizing

Select the image and drag the handles at its corners and edges. Size snaps to fractions of the text width. Preferences › Image resize step sets how coarse that snapping is (10%, 25%, or 50%).

## Caption and numbering

Hover the top right of the image for a Settings icon. Show Caption adds a caption field below it. Numbered labels it automatically ("Figure 1") and makes it referenceable with @. A Size slider is here too, for fine adjustment beyond the drag handles.

## Advanced: custom labels

Advanced Options in the same Settings panel shows the LaTeX Label directly, so you can rename it to something easier to remember. If you never set one, Texpile has already generated a random label for the image, so @ references still work.

## In Typst

Dragging the handles sets the width as a percentage of the text width, and the settings panel has a Width field for typing a Typst length instead. There is no size slider. Advanced Options has the Label, written as `<fig:x>` after the figure so @ references reach it; clearing the field removes it. A bare `#image` given a label becomes a `#figure`, since Typst references figures only. With Show Caption on, the figure is written with a `caption:`, empty until you type one, so Typst prints its "Figure 1" line as the editor does; turn Show Caption off for a figure without one.

## In Markdown

An image is shown in place, and that is all Markdown has syntax for. There is no resizing and no numbering.
