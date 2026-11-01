import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../engines/lualatexEngine';
import { errorSourceLines, renderTikz, statementTransforms } from '$lib/draw/tikz/renderTikz';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';

const AT = (e: number) =>
	[1, 0, 0, 1, e, 0, 28.45, 0, 0, 28.45] as [number, number, number, number, number, number, number, number, number, number];

describe('statement transforms', () => {
	it("takes a statement's own options for its points, and where it starts for turns about a point", () => {
		const { own, outer } = statementTransforms([
			{ i: 1, m: AT(0) },
			{ i: 1, m: AT(10), own: true },
			{ i: 2, m: AT(5) },
			// pgfplots marks an axis again after each plot
			{ i: 2, m: AT(99) }
		]);
		expect(own.get(1)![4]).toBeCloseTo(10 * (72 / 72.27));
		expect(outer.get(1)![4]).toBe(0);
		expect(own.get(2)![4]).toBeCloseTo(5 * (72 / 72.27));
	});
});

describe('a picture TeX cannot draw', () => {
	it('says what TeX said, and names a package it does not have as the likely cause', async () => {
		const source = '\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n';
		// a picture that never ends, however much of it is left out
		const errors = ['physketch.sty is not in this TeX, so the figure is drawn without it', '! Undefined control sequence.'];
		const tex = { render: async () => ({ marks: [], errors }), readFont: async () => new ArrayBuffer(0) };
		await expect(renderTikz(tex as never, source, readPicture(source)!)).rejects.toThrow(
			'TeX could not draw this picture: Undefined control sequence. physketch.sty is not in this TeX, which may be why.'
		);
	});
});

describe.skipIf(!hasLualatex)('errors', () => {
	useLualatex();
	it('names the line of the source TeX found each error on', async () => {
		const source =
			'\\documentclass{article}\n\\begin{document}\n\\newcommand{\\w}{1}\n\\begin{tikzpicture}\n  \\draw (0,0) -- (1,0);\n  \\draw[nosuchkey] (0,0) -- (\\w,1);\n\\end{tikzpicture}\n\\end{document}\n';
		const picture = readPicture(source)!;
		const job = instrumentPicture(source, picture);
		const result = await drawWithLualatex('\\documentclass{article}\\usepackage{tikz}', job);
		expect(result.errors[0]).toContain('nosuchkey');
		expect(errorSourceLines(source, picture, job, result)[0]).toBe(6);
	});
});
