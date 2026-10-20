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

	it('reads the caption of a float by its arguments: the short one apart, a commented one skipped', () => {
		const src = '\\begin{figure}\n% \\caption{Old}\n\\caption*[Brief]{The \\textbf{model}}\n\\end{figure}';
		expect(parseOutlineRaw(src)).toMatchObject([{ kind: 'figure', text: 'The model', short: 'Brief' }]);
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
		expect(parseOutlineRaw(src).map((i) => ('target' in i ? `input:${i.target}` : 'text' in i ? i.text : ''))).toEqual([
			'Kept',
			'input:kept'
		]);
	});

	it('follows what the file data says reads a part: \\import folders, TeX name syntax, not \\includeonly', () => {
		const main = parseOutlineRaw('\\includeonly{one}\n\\subimport{parts/}{two}\n\\input three\n\\section{After}');
		const merged = assembleProjectOutline(main, 'C:/p/main.tex', 'C:/p', 'C:/p', {
			'C:/p/main.tex': main,
			'C:/p/one.tex': parseOutlineRaw('\\section{One}'),
			'C:/p/parts/two.tex': parseOutlineRaw('\\section{Two}'),
			'C:/p/three.tex': parseOutlineRaw('\\section{Three}')
		});
		expect(merged.map((i) => i.text)).toEqual(['Two', 'Three', 'After']);
	});

	it('reads each heading level from the command data: a part above chapters, a class heading at its level', () => {
		const src = '\\part{P}\n\\chapter{C}\n\\specialsection{S}\n\\subsection{T}\n\\subparagraph{U}';
		expect(latexHeadings(src).map((i) => [i.text, i.level])).toEqual([
			['P', 1],
			['C', 2],
			['S', 3],
			['T', 4],
			['U', 7]
		]);
	});
});
