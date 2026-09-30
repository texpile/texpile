// The look of the report: the title page, the abstract, page numbers, and how a chapter opens.
// main.typ lists the chapters; the text is in chapters/.

#let report(
  title: [],
  subtitle: none,
  author: "",
  institution: none,
  date: datetime.today(),
  abstract: none,
  body,
) = {
  set document(title: title, author: author)
  set page(
    margin: (x: 2.8cm, y: 3cm),
    // roman numbers before the first chapter; the chapters count again from 1
    numbering: (n, ..) => context {
      let first = query(heading.where(level: 1)).find(it => it.numbering != none)
      let start = if first == none { 1 } else { first.location().page() }
      if n < start { numbering("i", n) } else { numbering("1", n - start + 1) }
    },
  )
  set text(size: 11pt, lang: "en")
  set par(justify: true)
  set heading(numbering: "1.1")
  set math.equation(numbering: "(1)")
  set bibliography(title: [References])

  // rules above and below the header row, and one under the last row
  set table(
    stroke: (_, y) => if y == 0 { (top: 0.8pt, bottom: 0.5pt) },
    inset: (x: 8pt, y: 5pt),
  )
  show table: it => box(stroke: (bottom: 0.8pt), it)
  show table.cell.where(y: 0): strong

  // every chapter (and the contents and the references) starts on a new page
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(2cm)
    if it.numbering != none {
      text(size: 12pt, fill: luma(40%))[Chapter #counter(heading).display("1")]
      v(0.3em)
    }
    text(size: 22pt, weight: "bold", it.body)
    v(0.8cm)
  }
  show heading.where(level: 2): set block(above: 1.6em, below: 0.9em)
  show outline.entry.where(level: 1): it => {
    v(0.6em, weak: true)
    strong(it)
  }

  page(numbering: none, align(center + horizon)[
    #text(size: 26pt, weight: "bold", title)
    #if subtitle != none {
      v(0.6em)
      text(size: 15pt, subtitle)
    }
    #v(3cm)
    #text(size: 13pt, author)
    #if institution != none {
      v(0.4em)
      institution
    }
    #v(0.4em)
    #date.display("[month repr:long] [day padding:none], [year]")
  ])

  if abstract != none {
    page[
      #v(2cm)
      #text(size: 22pt, weight: "bold")[Abstract]
      #v(0.8cm)
      #abstract
    ]
  }

  body
}
