import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldRangeAt } from '../../../../../../src/lib/languages/latex/intellisense/fold';

function foldAtLine(doc: string, lineNumber: number) {
	const state = EditorState.create({ doc });
	const line = state.doc.line(lineNumber);
	return foldRangeAt(state, line.from, line.to);
}

describe('folding: environments and sections', () => {
	it('folds a simple \\begin{...}/\\end{...} pair', () => {
		const doc = '\\begin{itemize}\n\\item a\n\\item b\n\\end{itemize}';
		const range = foldAtLine(doc, 1);
		expect(range).not.toBeNull();
		expect(doc.slice(range!.from, range!.to)).toBe('\n\\item a\n\\item b\n');
	});

	it('respects nesting of the SAME environment name', () => {
		const doc = '\\begin{itemize}\nouter\n\\begin{itemize}\ninner\n\\end{itemize}\nouter2\n\\end{itemize}';
		const range = foldAtLine(doc, 1);
		const folded = doc.slice(range!.from, range!.to);
		expect(folded).toContain('inner');
		expect(folded).toContain('outer2');
	});

	it('does not fold an unterminated environment', () => {
		const doc = '\\begin{itemize}\n\\item a';
		expect(foldAtLine(doc, 1)).toBeNull();
	});

	it('folds the preamble from \\documentclass down to the line before \\begin{document}', () => {
		const doc = '\\documentclass{article}\n\\usepackage{amsmath}\n% \\begin{document} in a comment\n\\title{T}\n\\begin{document}\nBody';
		const range = foldAtLine(doc, 1);
		expect(doc.slice(range!.from, range!.to)).toBe('\n\\usepackage{amsmath}\n% \\begin{document} in a comment\n\\title{T}');
	});

	it('has no preamble to fold when \\begin{document} follows the class, or the class is commented out', () => {
		expect(foldAtLine('\\documentclass{article}\n\\begin{document}\nBody', 1)).toBeNull();
		expect(foldAtLine('% \\documentclass{article}\n\\usepackage{x}\n\\begin{document}', 1)).toBeNull();
	});

	it('folds a section down to the next same-or-higher-level heading', () => {
		const doc = '\\section{A}\ntext A\n\\subsection{A1}\ntext A1\n\\section{B}\ntext B';
		const range = foldAtLine(doc, 1); // the \section{A} line
		const folded = doc.slice(range!.from, range!.to);
		expect(folded).toContain('text A');
		expect(folded).toContain('A1');
		expect(folded).not.toContain('text B');
	});

	it('a subsection folds only down to the next section OR subsection, not past it', () => {
		const doc = '\\section{A}\n\\subsection{A1}\ntext A1\n\\subsection{A2}\ntext A2';
		const range = foldAtLine(doc, 2); // the \subsection{A1} line
		const folded = doc.slice(range!.from, range!.to);
		expect(folded).toContain('text A1');
		expect(folded).not.toContain('text A2');
	});

	it('returns null on a plain content line', () => {
		expect(foldAtLine('just some text\nmore text', 1)).toBeNull();
	});
});
