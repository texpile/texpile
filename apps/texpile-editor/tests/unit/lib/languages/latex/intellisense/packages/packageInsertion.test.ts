import { describe, it, expect } from 'vitest';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';

function applied(text: string, name: string): string | null {
	const edit = addPackageInsertion(text, name);
	return edit && text.slice(0, edit.at) + edit.insert + text.slice(edit.at);
}

describe('addPackageInsertion', () => {
	it('goes on its own line after the last \\usepackage of the preamble', () => {
		const text =
			'\\documentclass{article}\n\\usepackage{a}\n\\usepackage[x]{b}\n\\title{T}\n\\begin{document}\n\\usepackage{late}\n\\end{document}';
		expect(applied(text, 'amsmath')).toBe(
			'\\documentclass{article}\n\\usepackage{a}\n\\usepackage[x]{b}\n\\usepackage{amsmath}\n\\title{T}\n\\begin{document}\n\\usepackage{late}\n\\end{document}'
		);
	});

	it('goes before \\begin{document} when no package is loaded', () => {
		expect(applied('\\documentclass{article}\n\\begin{document}\nx\n\\end{document}', 'amsmath')).toBe(
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nx\n\\end{document}'
		);
	});

	it('skips a \\usepackage inside a group, a macro body or a conditional', () => {
		const text =
			'\\documentclass{article}\n\\usepackage{a}\n\\newcommand{\\x}{\\usepackage{b}}\n\\ifx\\y\\z\n\\usepackage{c}\n\\fi\n' +
			'\\AtBeginDocument{\\usepackage{d}}\n\\begin{document}\n\\end{document}';
		expect(applied(text, 'amsmath')).toBe(text.replace('\\usepackage{a}\n', '\\usepackage{a}\n\\usepackage{amsmath}\n'));
	});

	it('goes before the line with \\begin{document} when the last \\usepackage line holds more', () => {
		const text = '\\documentclass{article}\n\\usepackage{a} \\title{T}\n\\begin{document}\n\\end{document}';
		expect(applied(text, 'amsmath')).toBe(
			'\\documentclass{article}\n\\usepackage{a} \\title{T}\n\\usepackage{amsmath}\n\\begin{document}\n\\end{document}'
		);
		expect(applied('\\usepackage{a}\\begin{document}\n', 'amsmath')).toBe('\\usepackage{amsmath}\n\\usepackage{a}\\begin{document}\n');
	});

	it('keeps the line endings of a CRLF file', () => {
		expect(applied('\\usepackage{a}\r\n\\begin{document}\r\n', 'amsmath')).toBe(
			'\\usepackage{a}\r\n\\usepackage{amsmath}\r\n\\begin{document}\r\n'
		);
	});

	it('is not offered without \\begin{document}', () => {
		expect(addPackageInsertion('\\usepackage{a}\n% \\begin{document}\n', 'amsmath')).toBeNull();
	});
});
