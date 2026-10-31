import { describe, expect, it } from 'vitest';
import { renamePastedNames } from '$lib/draw/tikz/source/arrange/pastedNames';

const PICTURE = '\\begin{tikzpicture}\n\\node[draw] (a) at (0,0) {A};\n\\node (a2) at (1,0) {};\n\\end{tikzpicture}';

describe('renamePastedNames', () => {
	it('gives a pasted node a name of its own and keeps its arrows on the copy', () => {
		const body = '\\node[draw] (a) at (0,0) {A};\n\\node[right=of a] (b) {B};\n\\draw[->] (a.east) -- (b);';
		expect(renamePastedNames(PICTURE, body)).toBe(
			'\\node[draw] (a3) at (0,0) {A};\n\\node[right=of a3] (b) {B};\n\\draw[->] (a3.east) -- (b);'
		);
	});

	it('leaves an arrow pasted alone on the node the picture has', () => {
		expect(renamePastedNames(PICTURE, '\\draw[->] (a) -- (2,0);')).toBe('\\draw[->] (a) -- (2,0);');
	});
});
