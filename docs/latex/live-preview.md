---
description: Live preview in Texpile: the page updates as you type, rendered by your own lualatex, with a full recompile only when a change cannot be rendered instantly.
blurb: The page updates as you type, rendered by your own lualatex.
icon: eye
order: 1
---

# Live preview

Live preview is Texpile's answer to recompiling by hand. Texpile injects its own scripts into your installed lualatex engine, so many changes, such as text edits, render instantly. Anything that cannot be rendered instantly is recompiled in full, automatically.

| Where to find it | Path                                              | Note                                                                                   |
| ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Toolbar          | The Preview button                                | Top right of the editor. It reads Live while the engine is running. Click it to pause. |
| Setting          | Terminal › Configure compile command… › Live mode |                                                                                        |

![A page updating in the live preview while the source is edited](../../landing/src/lib/assets/showcase/live-preview.webp 'A page updating in the live preview while the source is edited')

> [!NOTE]
> Live preview needs a TeX distribution installed. A failed compile is reported in the Problems panel.

[The Typst preview](../typst/live-preview.md)
