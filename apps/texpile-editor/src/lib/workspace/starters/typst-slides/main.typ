#import "template.typ": slides

#show: slides.with(
  title: [The Title of Your Talk],
  subtitle: [A subtitle, if it needs one],
  author: [Your Name],
)

= Every heading is a slide

- Start a new slide with a top-level heading
- Keep to a few words per point
  - and a level of detail below that
- Let the talk carry the rest

= Math

Equations work as in any Typst document:

$ integral_0^infinity e^(-x^2) dif x = sqrt(pi) / 2 $

= A figure

#figure(
  image("figures/chart.svg", height: 55%),
  caption: [A caption under the chart.],
)

= Thank you

Questions?
