import { describe, it, expect } from 'vitest';
import {
	latexHeadings,
	parseOutlineRaw,
	assembleProjectOutline
} from '../../../../../../src/lib/editor/visual/extensions/tableofcontents/latexHeadings';

describe('outline parsing and numbering', () => {
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
		expect(kinds).toContainEqual(['figure', undefined, 'The model']);
		expect(kinds).toContainEqual(['table', undefined, 'Results']);
		expect(kinds).toContainEqual(['frame', undefined, 'Motivation']);
		expect(kinds).toContainEqual(['frame', undefined, 'Deferred title']);
	});

	it('merges \\input fragments into one project outline, cycle-guarded', () => {
		const main = parseOutlineRaw('\\section{Main}\n\\input{chapters/one}\n\\section{After}');
		const child = parseOutlineRaw('\\section{Child}\n\\input{../main}');
		const merged = assembleProjectOutline(main, 'C:/proj/main.tex', 'C:/proj', 'C:/proj', {
			'C:/proj/chapters/one.tex': child,
			'C:/proj/main.tex': main
		});
		expect(merged.map((i) => [i.text, i.file])).toEqual([
			['Main', undefined],
			['Child', 'C:/proj/chapters/one.tex'],
			['After', undefined]
		]);
	});

	it('leaves out what TeX skips: a comment, an \\iffalse block, a comment environment', () => {
		const src = [
			'\\section{Kept}',
			'% \\section{Commented}',
			'\\iffalse \\section{Off} \\include{old} \\fi',
			'\\begin{comment}\\input{old2}\\end{comment}',
			'\\input{kept}'
		].join('\n');
		expect(parseOutlineRaw(src).map((i) => ('kind' in i && i.kind === 'input' ? `input:${i.target}` : 'text' in i ? i.text : ''))).toEqual([
			'Kept',
			'input:kept'
		]);
	});
});
