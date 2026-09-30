= Method <ch:method>

Describe what you did in enough detail that someone else could do it again @smith2023.

== Model

Give an equation a label to number it, then refer to it: @eq:growth models the quantity $N$ over
time $t$.

$ N(t) = N_0 e^(r t) $ <eq:growth>

== Data

@tab:data lists the measurements.

#figure(
  table(
    columns: 3,
    table.header([Sample], [Time (h)], [Count]),
    [1], [0], [120],
    [2], [4], [310],
    [3], [8], [790],
  ),
  caption: [The measurements, one sample per row.],
) <tab:data>
