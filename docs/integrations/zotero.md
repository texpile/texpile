---
nav: Zotero
description: Insert citations from your Zotero library into a LaTeX or Typst document in Texpile. Needs Zotero running with the Better BibTeX plugin.
blurb: Insert citations from your library. Needs the Better BibTeX plugin.
icon: library
order: 1
---

# Zotero

Search your Zotero library from inside Texpile, pick references, and have them added to your bibliography with the citation inserted at the caret. Works in LaTeX and Typst, in both editors, for the host of a shared session.

| Where to find it | Path                                          | Note                      |
| ---------------- | --------------------------------------------- | ------------------------- |
| Editor           | Right-click › Insert citation from Zotero     | In a LaTeX or Typst file. |
| Palette          | Insert citation from Zotero                   |                           |
| Settings         | Preferences › Integrations › Zotero citations | Off hides the action.     |

Zotero has to be running, with the Better BibTeX plugin installed. References go into the bibliography your main file declares. If there is none, Texpile finds or creates a .bib file, and you add the bibliography command to your main file yourself. A reference already in the bibliography is not added twice.

[Installing Better BibTeX](https://retorque.re/zotero-better-bibtex/installation/)

> [!NOTE]
> Better BibTeX is a third-party Zotero plugin. Texpile controls neither it nor Zotero.
