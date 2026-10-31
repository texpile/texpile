---
nav: Images
description: Open an image from the file tree, zoom it, see where documents use it, and crop, resize, turn and flip it with every change written to the file.
order: 4
---

# Images

Click an image file in the file tree to open it in an image tab.

## Viewer

The bar shows the size of the image in pixels, then zoom out, a zoom menu and zoom in. The zoom menu offers **Fit** and 25% to 400%.

- `Ctrl` scroll zooms at the pointer.
- Scroll and drag pan the image.
- Double-click switches between **Fit** and 100%.

| Key | Action   |
| --- | -------- |
| +   | Zoom in  |
| -   | Zoom out |
| 0   | Fit      |
| 1   | 100%     |

## Used in

The button with a document icon and a count lists the documents that include the image, each with its line. Choose one to open that document at that line.

## Edit

The pencil button turns **Edit** on for PNG, JPEG and WebP images. The bar then shows:

- Width and height boxes in pixels. Typing either one shrinks the image and the other follows its proportions. A size larger than the image changes nothing.
- **Crop**
- **Turn left** and **Turn right**
- **Flip horizontally** and **Flip vertically**
- **Undo** and **Redo**

Every change is written to the file at once, as text is.

While the crop box is up, **Cancel** and **Done** show. Enter is **Done** and Escape is **Cancel**.

To change how a document shows an image and keep the file as it is, see [Crop and turn](../latex/images.md#crop-and-turn).

## Restore original

Before the first change Texpile keeps a copy of the image. **Restore original** puts it back after asking.

- The copy is kept for 30 days.
- The copy follows the image when it is renamed or moved in Texpile.
- Restoring deletes the copy.

## In the visual editor

Images in the visual editor update when the file changes.
