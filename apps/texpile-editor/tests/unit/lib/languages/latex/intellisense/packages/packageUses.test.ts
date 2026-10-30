import { describe, expect, it } from 'vitest';
import { packageUsesIn } from '$lib/languages/latex/intellisense/packages/packageUses';

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

	it('reads a beamer theme as its file in the folder', () => {
		expect(packageUsesIn('\\documentclass{beamer}\n\\usetheme{Illinois}')).toContainEqual({
			name: 'beamerthemeIllinois',
			options: [],
			file: 'beamerthemeIllinois.sty'
		});
	});

	it('keeps a language selector in the order of the source', () => {
		const uses = packageUsesIn('\\usepackage{polyglossia}\n\\setmainlanguage{german}\n\\usepackage{amsmath}');
		expect(uses.map((u) => u.name)).toEqual(['polyglossia', 'polyglossia', 'amsmath']);
		expect(uses[1].options).toEqual(['german']);
	});

	it('reads a class a file loads by a name it defines itself', () => {
		const cls = '\\providecommand{\\baseclass}{book}\n\\LoadClass{\\baseclass}\n';
		expect(packageUsesIn(cls).map((u) => u.name)).toContain('class-book');
	});
});
