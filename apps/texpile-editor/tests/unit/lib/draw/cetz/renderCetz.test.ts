import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../engines/tinymistEngine';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SOURCE = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  rect((0, 0), (6, 4), stroke: none)
  circle((2, 2), radius: 1)
  line((0, 0), (3, 1), stroke: red)
  content((4, 3), [Hi $x^2$])
})
`;

describe.skipIf(!hasTinymist)('drawing CeTZ', () => {
	useTinymist();
	const engine = tinymistEngine;

	it('draws each statement as its own parts, in source units of a centimeter, from the canvas origin', async () => {
		const picture = lang.readPicture(SOURCE, 0)!;
		expect(picture.statements.map((s) => s.kind)).toEqual(['other', 'frame', 'path', 'path', 'node']);
		const drawn = await lang.render(engine, SOURCE, picture);
		expect(drawn.errors).toEqual([]);
		const owners = new Set(drawn.drawing.parts.map((p) => p.stmt));
		expect([...owners].sort()).toEqual([3, 4, 5]);
		const [a, b, c, d, e, f] = drawn.transforms.get(3)!;
		expect([a, b, c, d].map((v) => Math.round(v * 100) / 100)).toEqual([28.35, 0, 0, 28.35]);
		expect([Math.round(e), Math.round(f)]).toEqual([0, 0]);
	});

	it('leaves out what Typst cannot draw, its error on its line, and draws the rest', async () => {
		const broken = SOURCE.replace('line((0, 0), (3, 1), stroke: red)', 'line((0, 0), (3, 1), stroke: nosuchcolor)');
		const drawn = await lang.render(engine, broken, lang.readPicture(broken, 0)!);
		expect(drawn.failed).toEqual([4]);
		expect([drawn.errors[0], drawn.errorLines[0]]).toEqual([expect.stringMatching(/nosuchcolor/), 7]);
		expect(new Set(drawn.drawing.parts.map((p) => p.stmt))).toEqual(new Set([3, 5]));
	});
});
