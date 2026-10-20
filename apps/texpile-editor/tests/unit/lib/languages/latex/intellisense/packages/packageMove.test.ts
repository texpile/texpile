import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { movePackageAbove } from '$lib/languages/latex/intellisense/packages/packageMove';

function moved(text: string, first: string, second: string): string | null {
	const changes = movePackageAbove(text, first, second);
	return changes && EditorState.create({ doc: text }).update({ changes }).newDoc.toString();
}

const head = '\\documentclass{article}\n';

describe('movePackageAbove', () => {
	it('moves the line of the first package above the second, options and comment with it', () => {
		const text = `${head}\\usepackage{cleveref}\n\\usepackage{amsmath}\n\\usepackage[colorlinks]{hyperref} % links\n\\begin{document}\n\\end{document}\n`;
		expect(moved(text, 'hyperref', 'cleveref')).toBe(
			`${head}\\usepackage[colorlinks]{hyperref} % links\n\\usepackage{cleveref}\n\\usepackage{amsmath}\n\\begin{document}\n\\end{document}\n`
		);
	});

	it('gives up when a package shares its line, is loaded in a list or already comes first', () => {
		const body = '\\begin{document}\n';
		expect(moved(`${head}\\usepackage{cleveref}\\usepackage{hyperref}\n${body}`, 'hyperref', 'cleveref')).toBeNull();
		expect(moved(`${head}\\usepackage{cleveref,hyperref}\n${body}`, 'hyperref', 'cleveref')).toBeNull();
		expect(moved(`${head}\\usepackage{hyperref}\n\\usepackage{cleveref}\n${body}`, 'hyperref', 'cleveref')).toBeNull();
	});
});
