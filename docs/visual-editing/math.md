---
nav: Equations
description: Insert and edit equations in Texpile's visual editor: inline and display math, the math toolbar, numbering and cross-references, and what differs in Typst and Markdown.
blurb: Inline and display math, edited as math, with a symbol toolbar.
icon: sigma
order: 1
---

# Equations

Equations are edited as math on the page, in every format. Two shortcuts cover most of it, and everything else is a click away.

| Where to find it | Path          | Note                                                                                                                              |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Shortcut         | Ctrl+M        | Inline equation, flowing with the text.                                                                                           |
| Shortcut         | Ctrl+Shift+M  | Display equation, on its own line.                                                                                                |
| Shortcut         | Shift+Enter   | In a display equation: a new one of the same kind below it.                                                                       |
| Shortcut         | Tab           | In an equation: search for a symbol, or for a fraction, a root, a matrix and the like, and put it at the cursor.                  |
| Menu             | Insert › Math | Inline Equation, Display Equation, and in a LaTeX file every environment below; in a Typst file Aligned, Cases, and the matrices. |

## The math toolbar

Click into any equation and a toolbar appears above it: symbols grouped by kind (Greek, calculus, relations, sets, matrices), inserted at the cursor. A Select equation block button selects the whole equation as one unit.

![The math toolbar: Common, Greek, Calculus, Relations, Sets, Trig, Matrix, Science, and Envs](../../landing/src/lib/assets/showcase/app/math-toolbar.png)

## Searching for a symbol

Press Tab in an equation and a search opens under the cursor. Type a name or what the symbol means, such as `frac`, `matrix`, `arrow right double` or `not equal`. Up and Down move through the list, Enter or Tab puts the highlighted one at the cursor, and Escape closes the search. With nothing typed, it lists everything the math editor can draw: the toolbar's fractions, roots and matrices first, then every symbol, command and environment in a LaTeX file, or every symbol and function in a Typst file. In a LaTeX file, a symbol from a package the document does not load offers to add its `\usepackage`. The arrow keys move between the parts of a fraction or a matrix.

## Numbering and references

Hover an equation for a Settings icon beside it, and switch on Numbered. Type @ anywhere in the document to reference it by number. Renumbering after you add or remove equations is automatic.

![A display equation with its Settings icon at the right](../../landing/src/lib/assets/showcase/app/math-block-settings.png)

![The Numbered toggle in an equation's settings](../../landing/src/lib/assets/showcase/app/math-numbered-toggle.png)

## Environments

In a LaTeX file, the math environments are inserted from Insert › Math.

![The Insert Math menu, listing equation types and environments](../../landing/src/lib/assets/showcase/app/insert-math-menu.png#narrow)

## Labels and numbered equations

Switch on Numbered in an equation's settings to add a label. Which kind of label you get depends on the environment.

### Single equations

A plain equation gets one label. Find it under the settings' Advanced Options as `\label`, the same one a `\ref` points to, and edit it there.

### Align, Gather, Alignat, and Eqnarray

These get a label per line instead. Open the settings and fill in the Line Labels field for each line, or click Auto to generate one. Lines are split on `\\` in your LaTeX.

### Multline

Multline keeps a single label rather than one per line, since it still renders as one block.

![An Align equation's settings, showing per-line labels for line 1 and line 2](../../landing/src/lib/assets/showcase/app/math-align-line-labels.png#narrow)

## In Typst

The same math editor and toolbar apply. The settings panel has a Label field, and @ inserts a reference to it, the same as in LaTeX.

Typst numbers equations with one rule for the whole document, so the settings' Number all equations switch applies to every equation. On, it adds `#set math.equation(numbering: "(1)")` after the set rules at the top of the document, or keeps the numbering the document already has. Off, it takes that rule out. Typst can only reference a numbered equation.

Insert › Math also offers Aligned, Cases, and the two matrices, written as `&` alignment, `cases()`, and `mat()`. The other LaTeX environments have no Typst form. Every equation opens in the math editor as its Typst, and saving writes back what was there, so an edit changes only the part of the equation it touches. A function from a package or the document, such as `qty(1, "m")`, shows its name with its arguments editable, and `#` code inside an equation shows as a chip that keeps it as written. An equation Typst reports an error in stays in place as a Typst code chip, and is still editable there.

Typing in a Typst equation follows Typst's own syntax. A name such as `alpha` or `arrow.r` turns into its symbol once a space or an operator ends it, and a list of matching names shows while it is typed: Tab or Enter takes the highlighted one. A name followed by `(` builds what it names, so `frac(` gives a fraction and `abs(` absolute value bars; `,` moves to the next argument and `)` leaves it. `^`, `_`, and `/` take one item, as in Typst, or everything up to the matching `)` when it starts with `(`. `\` starts a new line, `&` aligns, `"` starts and ends text, and `#` starts code, which a space ends once its brackets are closed. Escape opens a box to type Typst into directly, and Enter puts it in place. Math copied from a Typst equation is Typst when pasted as text.

![A Typst equation's settings: a Label field and a note that numbering comes from the document](../../landing/src/lib/assets/showcase/app/typst-math-settings.png#narrow)

## In Markdown

Math between single dollar signs is inline and between double dollar signs is a block, edited with the same toolbar. There is no numbering and no label.
