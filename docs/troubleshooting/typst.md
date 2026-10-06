---
nav: Typst
description: Fixes for Typst problems in Texpile: tinymist missing or not running, a blank preview, jumps that do nothing, export errors, and templates that will not download.
blurb: Messages you may see with Typst, and what to do.
order: 2
---

# Troubleshooting Typst

| You see                                                     | Fix                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "tinymist is not installed."                                | Click **Set Up Typst**, or [install it yourself](../installation/typst/README.md).              |
| tinymist shows **Found, does not run**                      | Preferences › Toolchain › **Reinstall**.                                                        |
| The preview says Connecting or Reconnecting for a long time | Restart Texpile.                                                                                |
| "Nothing to preview yet."                                   | The document has an error. Fix it in Problems.                                                  |
| The preview shows another file than the one open            | The preview shows the main file. Right-click the open file › **Set as Main File**.              |
| Clicking the PDF does not jump to the source                | Only the preview jumps back. Turn on **Preview** in Configure Compile Command….                 |
| A font warning                                              | Install the font, or use a name the warning suggests.                                           |
| A `@preview/...` package does not load                      | The first compile with a package needs the internet.                                            |
| "tinymist would read ... in that path as a placeholder."    | Rename the file or folder so it has no `$root`, `$dir`, `$name`, `{p}`, `{0p}`, `{n}` or `{t}`. |
| "Nothing was exported."                                     | Fix the page range.                                                                             |
| No completion or hover                                      | They work in the source editor only.                                                            |
| Format Document is missing from the Format menu             | Switch to the source editor.                                                                    |
