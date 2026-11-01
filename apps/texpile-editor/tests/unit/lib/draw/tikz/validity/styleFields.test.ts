// the drawn check needs lualatex, and is skipped without it: every style field the inspector offers on a
// statement changes how TeX draws it, and shows what it draws
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, readLualatexFile, useLualatex } from '../../engines/lualatexEngine';
import { styleFindings } from '../../validity/styleEffects';
import type { NewShape } from '$lib/draw/editor/figure/figureLanguage';
import type { FigureEngine } from '$lib/draw/editor/provider/figureEngine';
import { tikzLanguage as lang } from '$lib/draw/tikz/tikzLanguage';
import { FIXTURES } from './validityFixtures';

const BLANK = FIXTURES.find((f) => f.name === 'starter tikzpicture')!.source;
const SHAPES: NewShape[] = [
	{ tool: 'line', from: [0, 0], to: [1, 1], via: [[0.5, 0]] },
	{ tool: 'arrow', from: [0, 2], to: [1, 3] },
	{ tool: 'curve', from: [0, 4], to: [1, 5] },
	{ tool: 'rect', from: [2, 0], to: [3, 1] },
	...(['rectangle', 'rounded', 'terminal', 'circle', 'ellipse', 'diamond', 'slant', 'cylinder'] as const).map((shape, k): NewShape => ({
		tool: 'box',
		from: [4, 2 * k],
		to: [5, 2 * k + 1],
		shape
	})),
	{ tool: 'state', at: [7, 0] },
	{ tool: 'ellipse', from: [2, 2], to: [3, 3], circle: true },
	{ tool: 'ellipse', from: [2, 4], to: [4, 5], circle: false },
	{
		tool: 'pen',
		points: [
			[0, 6],
			[1, 7],
			[2, 6]
		]
	},
	{
		tool: 'polygon',
		points: [
			[0, 8],
			[1, 9],
			[2, 8]
		]
	},
	{ tool: 'axes', from: [8, 2], to: [10, 4] },
	{ tool: 'text', at: [8, 6], text: 'Text' }
];

const MEASURED = String.raw`\documentclass{article}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
  \draw (0,0) -- (3,0);
  \node[draw] (n1) at (1,2) {A};
  \draw (5,1) circle[radius=1];
  \draw (7,0) -- (9,0);
  \draw (7,0) -- (8,2);
\end{tikzpicture}
\end{document}
`;

function measured() {
	let text = lang.addDimension(MEASURED, 0, { kind: 'aligned', from: { stmt: 1, k: 0 }, to: { stmt: 1, k: 1 }, offset: 0.5 })!;
	text = lang.addDimension(text, 0, { kind: 'node', stmt: 2, axis: 'y', side: 1, offset: 0.5 })!;
	text = lang.addDimension(text, 0, { kind: 'radius', center: { stmt: 3, k: 0 }, length: 1, value: 1, angle: 30 })!;
	const [a, b] = [4, 5].map((stmt) => [
		{ stmt, k: 0 },
		{ stmt, k: 1 }
	]);
	return lang.addDimension(text, 0, { kind: 'angle', lines: [a, b] as never, rays: [1, 1], radius: 0.8 })!;
}

const PICTURES: [string, () => string][] = [
	...FIXTURES.map((f): [string, () => string] => [f.name, () => f.source]),
	['shapes', () => SHAPES.reduce((text, shape) => lang.addShape(text, 0, shape) ?? text, BLANK)],
	[
		'parts',
		() =>
			lang.circuitParts.reduce((text, p, k) => {
				const shape: NewShape =
					p.placed === 'path' ? { tool: 'component', part: p.id, from: [0, k], to: [2, k] } : { tool: 'component', part: p.id, at: [4, k] };
				return lang.addShape(text, 0, shape) ?? text;
			}, BLANK)
	],
	['dimensions', measured],
	...lang.libraryElements.map((e): [string, () => string] => [`library ${e.id}`, () => lang.addElement(BLANK, 0, e)!])
];

describe.skipIf(!hasLualatex)('style fields', () => {
	useLualatex();
	let preamble = '';
	const tex: FigureEngine = { render: (job) => drawWithLualatex(preamble, job), readFont: readLualatexFile };

	it('changes what each field it offers says, on every kind of statement', async () => {
		const found: string[] = [];
		for (const [name, make] of PICTURES) {
			const draw = async (text: string) => {
				preamble = text.slice(0, text.indexOf('\\begin{document}'));
				const drawn = await lang.render(tex, text, lang.readPicture(text, 0)!);
				return { parts: drawn.drawing.parts, failed: drawn.failed ?? [] };
			};
			found.push(...(await styleFindings(lang, draw, make(), name)));
		}
		if (process.env.STYLE_OUT) (await import('node:fs')).writeFileSync(process.env.STYLE_OUT, found.join('\n'));
		expect(found).toEqual([]);
	}, 1_800_000);
});
