// The look of the paper: page, fonts, numbering and the title block.
// main.typ holds the words; change the style here.

#let paper(
  title: [],
  authors: (),
  abstract: none,
  body,
) = {
  set document(title: title, author: authors.map(author => author.name))
  set page(margin: 2.5cm, numbering: "1")
  set text(size: 11pt, lang: "en")
  set par(justify: true)
  set heading(numbering: "1.1")
  show heading: set block(above: 1.4em, below: 0.8em)
  show heading.where(level: 1): set text(size: 13pt)
  show heading.where(level: 2): set text(size: 11.5pt)
  set math.equation(numbering: "(1)")

  // rules above and below the header row, and one under the last row
  set table(
    stroke: (_, y) => if y == 0 { (top: 0.8pt, bottom: 0.5pt) },
    inset: (x: 8pt, y: 5pt),
  )
  show table: it => box(stroke: (bottom: 0.8pt), it)
  show table.cell.where(y: 0): strong
  show figure.caption: set text(size: 9.5pt)
  set bibliography(title: [References])

  align(center, text(size: 17pt, weight: "bold", title))
  v(0.6em)
  grid(
    columns: (1fr,) * calc.clamp(authors.len(), 1, 3),
    row-gutter: 1.2em,
    ..authors.map(author => align(center)[
      #author.name \
      #text(size: 9.5pt)[
        #author.affiliation \
        #link("mailto:" + author.email, raw(author.email))
      ]
    ]),
  )

  if abstract != none {
    v(1em)
    pad(x: 2.5em)[
      #set text(size: 9.5pt)
      #align(center, text(weight: "bold")[Abstract])
      #abstract
    ]
  }
  v(1.5em)

  body
}
