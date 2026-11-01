import { describe, expect, it } from 'vitest';
import { duplicateStatement } from '$lib/draw/tikz/source/arrange/duplicate';
import { readPicture } from '$lib/draw/tikz/source/picture';

describe('duplicating', () => {
	it('leaves the name off the copy, whatever characters the name has', () => {
		const source = '\\begin{tikzpicture}\n  \\node[draw, name=n+1] at (0,0) {x};\n\\end{tikzpicture}\n';
		const node = readPicture(source, 0)!.statements[0];
		const copy = duplicateStatement(source, node, 0, 0).split('\n')[2];
		expect(copy).toBe('  \\node[draw] at (0,0) {x};');
	});

	it('goes after the comment that names the original', () => {
		const source = '\\begin{tikzpicture}\n  \\node[draw] (a) at (0,0) {A};   % first\n\\end{tikzpicture}\n';
		const node = readPicture(source, 0)!.statements[0];
		expect(duplicateStatement(source, node, 0, 0).split('\n').slice(1, 3)).toEqual([
			'  \\node[draw] (a) at (0,0) {A};   % first',
			'  \\node[draw] at (0,0) {A};'
		]);
	});
});
