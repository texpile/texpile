// every style field the inspector offers on a statement changes how Typst draws it, and shows what it draws
import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../../engines/tinymistEngine';
import { styleFindings } from '../../validity/styleEffects';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';
import { LIBRARY_ELEMENTS } from '$lib/draw/cetz/library/libraryElements';
import { FIXTURES, SHAPES } from './validityFixtures';

const MEASURED = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  line((0, 0), (3, 0))
  rect((0, 2), (2, 3), name: "n1"); content("n1", [A])
  circle((5, 1), radius: 1)
  line((7, 0), (9, 0))
  line((7, 0), (8, 2))
})
`;

function measured() {
	let text = lang.addDimension(MEASURED, 0, { kind: 'aligned', from: { stmt: 2, k: 0 }, to: { stmt: 2, k: 1 }, offset: 0.5 })!;
	text = lang.addDimension(text, 0, { kind: 'node', stmt: 3, axis: 'y', side: 1, offset: 0.5 })!;
	text = lang.addDimension(text, 0, { kind: 'radius', center: { stmt: 4, k: 0 }, length: 1, value: 1, angle: 30 })!;
	return lang.addDimension(text, 0, {
		kind: 'angle',
		lines: [
			[
				{ stmt: 5, k: 0 },
				{ stmt: 5, k: 1 }
			],
			[
				{ stmt: 6, k: 0 },
				{ stmt: 6, k: 1 }
			]
		],
		rays: [1, 1],
		radius: 0.8
	})!;
}

const PICTURES: [string, () => string][] = [
	['plain', () => FIXTURES.plain],
	['shapes', () => SHAPES.reduce((text, shape) => lang.addShape(text, 0, shape) ?? text, lang.newPicture)],
	['dimensions', measured],
	...LIBRARY_ELEMENTS.map((e): [string, () => string] => [`library ${e.id}`, () => lang.addElement(lang.newPicture, 0, e)!])
];

describe.skipIf(!hasTinymist)('style fields', () => {
	useTinymist();
	const engine = tinymistEngine;

	it('changes what each field it offers says, on every kind of statement', async () => {
		const found: string[] = [];
		for (const [name, make] of PICTURES) {
			const draw = async (text: string) => {
				const drawn = await lang.render(engine, text, lang.readPicture(text, 0)!);
				return { parts: drawn.drawing.parts, failed: drawn.failed ?? [] };
			};
			found.push(...(await styleFindings(lang, draw, make(), name)));
		}
		if (process.env.STYLE_OUT) (await import('node:fs')).writeFileSync(process.env.STYLE_OUT, found.join('\n'));
		expect(found).toEqual([]);
	}, 300_000);
});
