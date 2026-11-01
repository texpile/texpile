import { describe, expect, it } from 'vitest';
import { headWrite } from '$lib/draw/host/tab/headWrite';

describe('headWrite', () => {
	it('takes the new preamble and keeps the picture as it is now', () => {
		const now = '\\usepackage{tikz}\n\\begin{tikzpicture}\n\\end{tikzpicture}\n';
		const next = '\\usepackage{tikz}\n\\usetikzlibrary{shapes.geometric}\n\\begin{tikzpicture}\n\\node[ellipse]{};\n\\end{tikzpicture}\n';
		expect(headWrite(now, next, 18, next.indexOf('\\begin'))).toBe(
			'\\usepackage{tikz}\n\\usetikzlibrary{shapes.geometric}\n\\begin{tikzpicture}\n\\end{tikzpicture}\n'
		);
		expect(headWrite(now, now.replace('\\end', 'x\\end'), 18, 18)).toBeNull();
	});
});
