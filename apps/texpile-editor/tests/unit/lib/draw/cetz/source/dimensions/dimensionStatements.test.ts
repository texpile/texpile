import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../../../engines/tinymistEngine';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  line((0, 0), (3, 0), (3, 4), close: true)
  rect((5, 0), (7, 1), name: "n1"); content("n1", [A])
})
`;
const at = (text: string, i: number) => lang.readPicture(text, 0)!.statements.find((s) => s.i === i)!;

describe('a CeTZ dimension, as TikZ writes one, measured by Typst', () => {
	useTinymist();

	it('names what it measures, defines `texpile-dimension` once and reads back what it measures', () => {
		const once = lang.addDimension(SRC, 0, { kind: 'aligned', from: { stmt: 2, k: 1 }, to: { stmt: 2, k: 2 }, offset: 0.5 })!;
		expect(once).toContain('line((0, 0), (3, 0), (3, 4), close: true, name: "n2")');
		expect(once).toContain('texpile-dimension("n2.25%", "n2.58.33%", offset: 0.5)');
		expect(once.match(/#let texpile-dimension\(/g)).toHaveLength(1);
		const twice = lang.addDimension(once, 0, { kind: 'node', stmt: 3, axis: 'x', side: 1, offset: 0.5 })!;
		expect(twice).toContain('texpile-dimension(("n1.north", "-|", "n1.west"), ("n1.north", "-|", "n1.east"), kind: "x", offset: 0.5)');
		expect(twice.match(/#let texpile-dimension\(/g)).toHaveLength(1);
		const picture = lang.readPicture(twice, 0)!;
		expect(lang.readDimension(twice, picture, at(twice, 4))).toEqual({
			kind: 'aligned',
			from: { stmt: 2, k: 1 },
			to: { stmt: 2, k: 2 },
			offset: 0.5
		});
		expect(lang.readDimension(twice, picture, at(twice, 5))).toEqual({ kind: 'node', stmt: 3, axis: 'x', side: 1, offset: 0.5 });
	});

	it('measures the same vertices when the line changes, and prints a name given it', () => {
		const once = lang.addDimension(SRC, 0, { kind: 'aligned', from: { stmt: 2, k: 1 }, to: { stmt: 2, k: 2 }, offset: 0.5 })!;
		const moved = lang.movePoint(once, lang.pathPoints(once, at(once, 2)), 2, [3, 10]);
		expect(moved).toContain('line((0, 0), (3, 0), (3, 10), close: true, name: "n2")');
		expect(moved).toContain('texpile-dimension("n2.12.8%", "n2.55.46%", offset: 0.5)');
		const named = lang.relabelDimension(once, 0, 4, 'h')!;
		expect(named).toContain('texpile-dimension("n2.25%", "n2.58.33%", offset: 0.5, label: [h])');
	});

	it.skipIf(!hasTinymist)('draws its line, marks and number in the stroke color it is given', async () => {
		const once = lang.addDimension(SRC, 0, { kind: 'aligned', from: { stmt: 2, k: 1 }, to: { stmt: 2, k: 2 }, offset: 0.5 })!;
		const red = lang.writeStyle(once, at(once, 4), { stroke: 'red' })!;
		const drawn = await lang.render(tinymistEngine, red, lang.readPicture(red, 0)!);
		expect(drawn.errors).toEqual([]);
		const paints = drawn.drawing.parts.flatMap((p) =>
			p.stmt !== 4 ? [] : p.kind === 'path' ? [p.stroke ?? p.fill] : p.kind === 'glyph' ? [p.fill] : []
		);
		expect(paints.length).toBeGreaterThan(3);
		expect(new Set(paints.filter((c) => c !== '#fff'))).toEqual(new Set(['#ff4136']));
	});

	it('keeps its stroke when what it measures moves', () => {
		const once = lang.addDimension(SRC, 0, { kind: 'aligned', from: { stmt: 2, k: 0 }, to: { stmt: 2, k: 1 }, offset: 0.5 })!;
		const red = lang.writeStyle(once, at(once, 4), { stroke: 'red' })!;
		const moved = lang.movePoint(red, lang.pathPoints(red, at(red, 2)), 1, [4, 0]);
		expect(moved).toContain('texpile-dimension("n2.0%", "n2.30.48%", offset: 0.5, stroke: red)');
	});

	it.skipIf(!hasTinymist)("measures the corner two lines share with CeTZ's own angle, in its stroke", async () => {
		const corner = {
			kind: 'angle',
			lines: [
				[
					{ stmt: 2, k: 1 },
					{ stmt: 2, k: 0 }
				],
				[
					{ stmt: 2, k: 1 },
					{ stmt: 2, k: 2 }
				]
			],
			rays: [1, 1],
			radius: 0.8
		} as const;
		const once = lang.addDimension(SRC, 0, corner as never)!;
		expect(once).toMatch(/^#import "@preview\/cetz:0\.4\.2": canvas, draw, angle$/m);
		expect(once).not.toContain('texpile-dimension');
		const red = lang.writeStyle(once, at(once, 4), { stroke: 'red' })!;
		expect(red).toContain('angle.angle("n2.25%", "n2.0%", "n2.58.33%", radius: 0.8, label: a => text(size: 8pt, fill: red)');
		expect(lang.readDimension(red, lang.readPicture(red, 0)!, at(red, 4))).toMatchObject({ kind: 'angle', radius: 0.8 });
		const drawn = await lang.render(tinymistEngine, red, lang.readPicture(red, 0)!);
		expect(drawn.errors).toEqual([]);
	});
});
