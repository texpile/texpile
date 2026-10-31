import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../lib/draw/engines/lualatexEngine';

const PREAMBLE = '\\documentclass{article}\\usepackage{tikz}';
const PICTURE = '\\begin{tikzpicture}\\draw (0,0) rectangle (2,1);\\node at (1,2) {$x^2$};\\end{tikzpicture}';

describe.skipIf(!hasLualatex)('the warm lualatex', () => {
	useLualatex();

	it('starts each picture from the same state', async () => {
		const first = await drawWithLualatex(PREAMBLE, PICTURE);
		expect(first.errors).toEqual([]);
		await drawWithLualatex(PREAMBLE, PICTURE);
		expect((await drawWithLualatex(PREAMBLE, PICTURE)).recs).toEqual(first.recs);
	});

	it('keeps each preamble apart', async () => {
		const own = '\\documentclass{article}\\usepackage{tikz}\\newcommand{\\half}{0.5}';
		const picture = '\\begin{tikzpicture}\\draw (0,0) -- (\\half,1);\\end{tikzpicture}';
		expect((await drawWithLualatex(own, picture)).errors).toEqual([]);
		expect((await drawWithLualatex(PREAMBLE, PICTURE)).errors).toEqual([]);
		expect((await drawWithLualatex(PREAMBLE, picture)).errors.join()).toContain('Undefined control sequence');
		expect((await drawWithLualatex(own, picture)).errors).toEqual([]);
	});

	it('reads an error whole where TeX broke its line', async () => {
		const result = await drawWithLualatex(PREAMBLE, '\\begin{tikzpicture}\\node[shape example] {a};\\end{tikzpicture}');
		expect(result.errors[0]).toContain("I do not know the key '/tikz/shape example' and I am going to ignore it.");
	});

	it('reads a pdfLaTeX preamble: \\pdfoutput, and px units in pgf math', async () => {
		const result = await drawWithLualatex(
			'\\documentclass{article}\n\\pdfoutput=1\n\\usepackage{hyperref}\\usepackage{tikz}',
			'\\begin{tikzpicture}\\draw (0,0) -- ({10px},0);\\end{tikzpicture}'
		);
		expect(result.errors).toEqual([]);
		// 10px is 10bp, as under pdfTeX
		expect(result.recs.some((r) => r.t === 'l' && /^10(\.0+)? 0\.0 l/.test(r.d))).toBe(true);
	});

	it('sets UTF-8 text', async () => {
		const text = await drawWithLualatex(PREAMBLE, '\\begin{tikzpicture}\\node {fi é – “q”};\\end{tikzpicture}');
		expect(text.errors).toEqual([]);
		const codes = text.recs.flatMap((r) => (r.t === 'g' ? [r.c] : []));
		expect(codes).toEqual(expect.arrayContaining([233, 0x2013, 0x201c, 0x201d]));
	});
});
