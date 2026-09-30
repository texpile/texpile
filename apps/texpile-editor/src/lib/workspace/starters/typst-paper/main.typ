#import "template.typ": paper

#show: paper.with(
  title: [The Title of Your Paper],
  authors: (
    (name: "First Author", affiliation: "Your Institution", email: "first.author@example.com"),
    (name: "Second Author", affiliation: "Your Institution", email: "second.author@example.com"),
  ),
  abstract: [
    Write your abstract here: the question, what you did, and what you found, in a few sentences.
  ],
)

= Introduction <sec:intro>

Begin your paper here. Cite a source like this @doe2024, or two at once @doe2024 @smith2023. The
page, the fonts and the title block are set up in `template.typ`, so this file holds only your text.

= Method <sec:method>

Give an equation a label to number it, then refer to it by that label: @eq:model relates the
outcome $y$ to the predictor $x$.

$ y = beta_0 + beta_1 x + epsilon $ <eq:model>

= Results <sec:results>

@fig:results shows the measurements, and @tab:summary sums them up.

#figure(
  image("figures/results.svg", width: 60%),
  caption: [A caption says what the figure shows.],
) <fig:results>

#figure(
  table(
    columns: 3,
    table.header([Condition], [Mean], [SD]),
    [A], [4.2], [0.8],
    [B], [6.1], [1.1],
    [C], [2.9], [0.6],
    [D], [5.0], [0.9],
  ),
  caption: [Tables are numbered separately from figures.],
) <tab:summary>

= Conclusion <sec:conclusion>

Summarize what you found, and what it means.

#bibliography("references.bib")
