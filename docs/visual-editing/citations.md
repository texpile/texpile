---
nav: Citations
description: Insert and edit citations in Texpile's visual editor: the @ picker, page numbers, prefixes, citation style, managing your .bib files, and what differs in Typst and Markdown.
blurb: Type @ for a picker across your bibliography and your own figures, tables, and equations.
icon: book-marked
order: 4
---

# Citations

Citations and cross-references share one picker.

| Where to find it | Path                           | Note                                                                                                      |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| In the editor    | Type @, then search            | Matches by citation key, author, title, or year.                                                          |
| Menu             | Insert › References › Citation | Inserts your first bibliography entry directly, useful as a placeholder to configure. It is not a picker. |

## One picker, two sources

The @ picker searches your bibliography and, in the same list, your document's own numbered figures, tables, and equations, so `\cite` and `\ref` both start the same way.

![Typing @ to search: bibliography entries above, numbered equations below, in one list](../../landing/src/lib/assets/showcase/app/citation-ref-picker.png#narrow)

## Editing a citation

Click an inserted citation to open its editor: a Page numbers field for a pinpoint reference, and under Advanced Options, Add prefix (with see / cf. / compare as one-click fills) and a Citation style picker with Automatic, Parenthetical, In-text, or Basic.

## Managing your bibliography

The @ picker reads whichever .bib files are in your project. Open the .bib file itself to edit it as a form rather than as source: add references, fill the required fields for each entry type, and paste raw BibTeX to import. Entries the parser cannot model stay editable as raw text.

![The reference manager editing a .bib entry as a form](../../landing/src/lib/assets/showcase/editor-references.webp)

## In Typst

The @ picker works the same way. A citation key shows as the author and year, and any other reference shows its label, since the number comes from the compiler. A `#bibliography` call shows as a card, and a .bib file it points at opens in the same form.

Clicking a citation opens the same editor without Add prefix, which Typst has no place for. Page numbers are written as the citation's supplement, `@key[p. 7]`. Citation style picks Automatic, In-text, Author only, Year only, or Full reference; anything but Automatic is written as a call, `#cite(<key>, form: "prose")`. Clicking a reference to a label offers its Supplement instead, the word printed before the number, as in `@sec:intro[Chapter]`. A citation you do not edit keeps the spelling it has in the file.

Keys from a Hayagriva .yml bibliography, Typst's own format, are in the picker too, once the main file's `#bibliography` names it. References added from Zotero or by DOI are BibTeX, so they always go into a .bib file: when `#bibliography` lists only .yml files, Texpile adds them to a .bib and asks you to list it as well.

## In Markdown

Markdown has no bibliography, so the picker is not offered.
