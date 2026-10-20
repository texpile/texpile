import { describe, expect, it } from 'vitest';
import { packageUsesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { withUsepackage } from '$lib/languages/latex/symbols/latexSymbolPackage';

describe('packageUsesIn', () => {
	it('names the shipped file, the class prefix, the options and a library', () => {
		const text =
			'\\documentclass[12pt]{report}\n\\RequirePackage[main=german, T1]{babel,fontenc} % \\usepackage{no}\n\\usetikzlibrary{calc}';
		expect(packageUsesIn(text)).toEqual([
			{ name: 'class-report', options: ['12pt'], file: 'report.cls' },
			{ name: 'babel', options: ['main=german', 'german', 'T1'], file: 'babel.sty' },
			{ name: 'fontenc', options: ['main=german', 'german', 'T1'], file: 'fontenc.sty' },
			{ name: 'tikzlibrarycalc', options: [] }
		]);
	});

	it('keeps a language selector in the order of the source', () => {
		const uses = packageUsesIn('\\usepackage{polyglossia}\n\\setmainlanguage{german}\n\\usepackage{amsmath}');
		expect(uses.map((u) => u.name)).toEqual(['polyglossia', 'polyglossia', 'amsmath']);
		expect(uses[1].options).toEqual(['german']);
	});
});

describe('withUsepackage', () => {
	it('goes after the last package loader and its release date, skipping a commented one', () => {
		const text = '\\documentclass{article}\n\\usepackage{a}[2020/01/01]\n%\\usepackage{c}\n\\begin{document}\n\\end{document}';
		expect(withUsepackage(text, '\\usepackage{b}')).toBe(
			'\\documentclass{article}\n\\usepackage{a}[2020/01/01]\n\\usepackage{b}\n%\\usepackage{c}\n\\begin{document}\n\\end{document}'
		);
	});
});
