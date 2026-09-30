// The look of the slides: a 16:9 page, the title slide, and a new slide at every top-level heading.
// main.typ holds the slides themselves.

#let accent = rgb("#1d4ed8")

#let slides(
  title: [],
  subtitle: none,
  author: [],
  date: datetime.today(),
  body,
) = {
  set document(title: title)
  set page(
    paper: "presentation-16-9",
    margin: (x: 1.8cm, top: 1.4cm, bottom: 1.4cm),
    footer: context {
      set text(size: 12pt, fill: luma(45%))
      title
      h(1fr)
      counter(page).display()
    },
  )
  set text(size: 22pt, lang: "en")
  set list(spacing: 0.9em, marker: text(fill: accent)[•])
  set enum(spacing: 0.9em)
  set math.equation(numbering: none)

  // each = heading opens a new slide
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    block(below: 1em, text(size: 30pt, fill: accent, it.body))
  }
  show heading.where(level: 2): set text(size: 24pt)

  page(footer: none, fill: accent)[
    #set text(fill: white)
    #v(1fr)
    #text(size: 40pt, weight: "bold", title)
    #if subtitle != none {
      v(0.4em)
      text(size: 24pt, subtitle)
    }
    #v(1.2em)
    #author \
    #text(size: 18pt, date.display("[month repr:long] [day padding:none], [year]"))
    #v(1fr)
  ]

  body
}
