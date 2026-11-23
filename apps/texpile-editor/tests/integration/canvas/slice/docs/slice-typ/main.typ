#set heading(numbering: "1.")
#set math.equation(numbering: "(1)")

= The slice

A paragraph with a note#footnote[The note.] and the formula $E = m c^2$ in the middle of its words, long enough to wrap across the column of the pane.

$ integral_0^1 x dif x = 1/2 $ <half>

#figure(
  table(
    columns: 3,
    [a], [b], [c],
    [d], [e], [f],
    [g], [h], [i],
  ),
  caption: [Three by three],
)

#diagram(
  node((0, 0), [A]),
  edge((0, 0), (1, 0), "->"),
)

- First point
- Second point

The last paragraph.
