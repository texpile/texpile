import { describe, expect, it } from 'vitest';
import { withLibrary, withPackage } from '$lib/draw/tikz/source/options/libraries';

const doc = (preamble: string) => `\\documentclass{article}\n${preamble}\n\\begin{document}\nx\n\\end{document}\n`;

describe('adding to a preamble', () => {
	it('reads a commented library as not loaded, and writes on a real line', () => {
		expect(withLibrary(doc('\\usepackage{tikz}\n% \\usetikzlibrary{calc}'), 'calc').source).toBe(
			doc('\\usepackage{tikz}\n\\usetikzlibrary{calc}\n% \\usetikzlibrary{calc}')
		);
		expect(withLibrary(doc('\\usepackage{tikz}\n\\usetikzlibrary{calc}\n%\\usetikzlibrary{old}'), 'shapes').source).toBe(
			doc('\\usepackage{tikz}\n\\usetikzlibrary{calc,shapes}\n%\\usetikzlibrary{old}')
		);
	});

	it('takes a commented \\begin{document} and \\usepackage for the comments they are', () => {
		const src = doc('% not after \\begin{document}\n% \\usepackage{tikz}\n\\usepackage{pgfplots}');
		expect(withLibrary(src, 'calc').source).toBe(
			doc('% not after \\begin{document}\n% \\usepackage{tikz}\n\\usepackage{pgfplots}\n\\usetikzlibrary{calc}')
		);
		expect(withPackage(src, 'tikz')).toBe(
			doc('% not after \\begin{document}\n% \\usepackage{tikz}\n\\usepackage{pgfplots}\n\\usepackage{tikz}')
		);
	});

	it('adds to a list over several lines after its last name', () => {
		expect(withLibrary(doc('\\usepackage{tikz}\n\\usetikzlibrary{\n  calc,\n  shapes\n}'), 'fit').source).toBe(
			doc('\\usepackage{tikz}\n\\usetikzlibrary{\n  calc,\n  shapes,fit\n}')
		);
	});
});
