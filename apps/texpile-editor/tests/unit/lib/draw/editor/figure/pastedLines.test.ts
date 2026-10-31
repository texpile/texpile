import { expect, it } from 'vitest';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';

it('statements copied from where the first starts paste at the picture indent, nested ones one deeper', () => {
	const src = '\\begin{tikzpicture}\n  \\node (a) at (0,0) {A};\n\\end{tikzpicture}\n';
	const pasted = tikzLanguage.appendStatements(
		src,
		0,
		'\\node (a) at (0,0) {A};\n  \\begin{scope}\n    \\draw (a) -- (1,1);\n  \\end{scope}'
	);
	expect(pasted).toBe(
		'\\begin{tikzpicture}\n  \\node (a) at (0,0) {A};\n  \\node (a2) at (0,0) {A};\n  \\begin{scope}\n    \\draw (a2) -- (1,1);\n  \\end{scope}\n\\end{tikzpicture}\n'
	);
});
