import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../lib/draw/engines/lualatexEngine';

describe.skipIf(!hasLualatex)('the warm lualatex and virtual fonts', () => {
	useLualatex();

	it('draws virtual fonts from the fonts they set', async () => {
		const times = await drawWithLualatex(
			'\\documentclass{article}\\usepackage[T1]{fontenc}\\usepackage{times}\\usepackage{tikz}',
			'\\begin{tikzpicture}\\node {fiq};\\end{tikzpicture}'
		);
		expect(times.errors).toEqual([]);
		expect(times.fonts.map((f) => f.name)).toEqual(['ptmr8r']);
		expect(times.fonts.every((f) => f.t1)).toBe(true);
	});
});
