import { describe, it, expect } from 'vitest';
import {
	latexHeadings,
	parseOutlineRaw,
	assembleProjectOutline
} from '../../../../../../src/lib/editor/extensions/tableofcontents/latexHeadings';

describe('outline parsing and numbering', () => {
	it('numbers headings, letters appendices, skips starred ones', () => {
		const src = [
			'\\section{One}',
			'\\subsection{One A}',
			'\\section*{Unnumbered}',
			'\\section{Two}',
			'\\appendix',
			'\\section{Extra}'
		].join('\n');
		const items = latexHeadings(src);
		expect(items.map((i) => [i.number, i.text])).toEqual([
			['1', 'One'],
			['1.1', 'One A'],
			[undefined, 'Unnumbered'],
			['2', 'Two'],
			['A', 'Extra']
		]);
	});

	it('lists floats with captions and beamer frames with titles', () => {
		const src = [
			'\\section{Intro}',
			'\\begin{figure}\\includegraphics{x}\\caption{The \\textbf{model}}\\end{figure}',
			'\\begin{table}\\caption{Results}\\end{table}',
			'\\begin{frame}{Motivation}text\\end{frame}',
			'\\begin{frame}\\frametitle{Deferred title}text\\end{frame}'
		].join('\n');
		const items = latexHeadings(src);
		const kinds = items.map((i) => [i.kind, i.number, i.text]);
		expect(kinds).toContainEqual(['figure', '1', 'The model']);
		expect(kinds).toContainEqual(['table', '1', 'Results']);
		expect(kinds).toContainEqual(['frame', undefined, 'Motivation']);
		expect(kinds).toContainEqual(['frame', undefined, 'Deferred title']);
	});

	it('merges \\input fragments into one numbered project outline, cycle-guarded', () => {
		const main = parseOutlineRaw('\\section{Main}\n\\input{chapters/one}\n\\section{After}');
		const child = parseOutlineRaw('\\section{Child}\n\\input{../main}');
		const merged = assembleProjectOutline(main, 'C:/proj/main.tex', 'C:/proj', 'C:/proj', {
			'C:/proj/chapters/one.tex': child,
			'C:/proj/main.tex': main
		});
		expect(merged.map((i) => [i.number, i.text, i.file])).toEqual([
			['1', 'Main', undefined],
			['2', 'Child', 'C:/proj/chapters/one.tex'],
			['3', 'After', undefined]
		]);
	});
});
