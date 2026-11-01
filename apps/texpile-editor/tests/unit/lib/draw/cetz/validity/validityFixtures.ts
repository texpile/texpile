// a picture of each kind the editor reads, and a shape of each kind it draws
import type { NewShape } from '$lib/draw/editor/figure/figureLanguage';
import { FINITE_IMPORT } from '$lib/draw/cetz/source/nodes/states';
import { TEXPILE } from '$lib/draw/cetz/texpile';

export const FIXTURES: Record<string, string> = {
	plain: `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  rect((0, 0), (8, 6), stroke: none)
  rect((1, 1), (3, 2), fill: blue.lighten(60%))
  circle((5, 4), radius: 1)
  circle((6, 1), radius: (1, 0.5))
  line((0, 5), (2, 4), (3, 5), stroke: red + 2pt)
  bezier((4, 0), (7, 0), (5, 1), (6, -1))
  content((1, 4), [A $x^2$], name: "a")
  line("a", (4, 2), mark: (end: ">"))
  group({
    rect((6, 3), (7, 4))
    circle((7.5, 3.5), radius: 0.3)
    rect((6, 2), (7, 2.5), name: "g1"); content("g1", [In])
    content((7.5, 2), [$y$], anchor: "south", padding: 0.1)
  })
  rect((0, 7), (2, 8), name: "b1"); content("b1", [Box])
  line((4, 8), (5, 7.5), (4, 7), (3, 7.5), close: true, name: "d1"); content("d1", [Yes?])
  circle((7, 7.5), radius: (1, 0.5), name: "e1", fill: green)
  content("e1", text(fill: red)[Ellipse])
  content((1, 9), [Framed], frame: "rect", padding: 0.1)
  line("b1.east", "d1", mark: (end: ">"))
  bezier("b1.10deg", "e1.170deg", ("b1.10deg", 39%, 30deg, "e1.170deg"), ("e1.170deg", 39%, -30deg, "b1.10deg"), name: "c1"); content("c1.50%", [on it], anchor: "south", padding: 0.1)
  line("d1", ("d1", "-|", "e1"), "e1")
  scope({ rotate(30deg, origin: (5, 5)); rect((4, 4), (6, 6), name: "r2"); content("r2", [Turned], angle: 30deg) })
  content((9, 9), [Tilted], angle: 15deg)
  rect((rel: (-1, -1), to: "b1.south"), (rel: (2, -1)), name: "p1"); content("p1", [Below])
  content((rel: (1, 0), to: "p1.east"), [Beside], anchor: "west")
  arc((3, 0), start: 0deg, stop: 120deg, radius: 1, stroke: blue)
  line((5, 0), (8, 0), (8, 2), mark: (start: ">", end: ">"))
  finite.draw.state((10, 5), "q0", label: [$q_0$], initial: true)
  finite.draw.state((12, 5), "q1", label: [$q_1$], final: true)
  bezier("q0.75deg", "q0.105deg", (rel: (0.26, 0.97), to: "q0.75deg"), (rel: (-0.26, 0.97), to: "q0.105deg"), mark: (end: "straight"))
})
`.replace('#canvas', `${FINITE_IMPORT}\n${TEXPILE}\n\n#canvas`),
	prefixed: `#import "@preview/cetz:0.4.2"

#cetz.canvas({
  cetz.draw.line((0, 0), (1, 1))
  cetz.draw.content((2, 2), [B])
})
`
};
export const TYPED = ['Plain', '50% done', 'a_b', 'x^2', 'Q & A', 'item #1', '*bold*', '[x]', '$x_1$', 'a\\b', 'name@mail', '<tag>'];
export const SHAPES: NewShape[] = [
	{ tool: 'line', from: [0, 0], to: [1, 1], via: [[0.5, 0]] },
	{ tool: 'arrow', from: [0, 0], to: [2, 1] },
	{ tool: 'curve', from: [0, 0], to: [2, 1] },
	{ tool: 'rect', from: [0, 0], to: [1, 1] },
	...(['rectangle', 'rounded', 'terminal', 'circle', 'ellipse', 'diamond', 'slant'] as const).map((shape): NewShape => ({
		tool: 'box',
		from: [0, 0],
		to: [2, 1],
		shape
	})),
	{ tool: 'ellipse', from: [0, 0], to: [2, 1], circle: false },
	{ tool: 'ellipse', from: [0, 0], to: [2, 2], circle: true },
	{
		tool: 'pen',
		points: [
			[0, 0],
			[1, 1],
			[2, 0]
		]
	},
	{
		tool: 'polygon',
		points: [
			[0, 0],
			[1, 1],
			[2, 0]
		]
	},
	{ tool: 'text', at: [1, 1], text: '' },
	{ tool: 'axes', from: [0, 0], to: [3, 2] },
	{ tool: 'state', at: [3, 3] }
];
