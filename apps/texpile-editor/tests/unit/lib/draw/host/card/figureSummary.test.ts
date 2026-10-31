import { describe, expect, it } from 'vitest';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { figureSummary } from '$lib/draw/host/card/figureSummary';

describe('what a figure card says it holds', () => {
	it('counts a TikZ picture by what its objects list calls each statement', () => {
		const tikz = '\\begin{tikzpicture}\n\\node[draw] (a) {A};\n\\node[draw] (b) at (2,0) {B};\n\\draw[->] (a) -- (b);\n\\end{tikzpicture}';
		expect(figureSummary(tikzLanguage, tikz)).toBe('2 boxes, 1 arrow');
	});

	it('leaves out what draws nothing, as a CeTZ import', () => {
		const cetz = '#cetz.canvas({\n  import cetz.draw: *\n  circle((0, 0))\n})';
		expect(figureSummary(cetzLanguage, cetz)).toBe('1 circle');
	});
});
