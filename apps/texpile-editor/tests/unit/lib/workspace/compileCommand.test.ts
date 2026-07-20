import { describe, it, expect } from 'vitest';
import {
	compileOutDir,
	detectEngine,
	usesLatexmk,
	buildCompileCommand,
	resolveOutputPath,
	detectedPdfPath,
	expectedPdfPath,
	expectedLogPath,
	outputPathIssue
} from '$lib/workspace/compileCommand';

const DEFAULT = 'latexmk -lualatex -interaction=nonstopmode -file-line-error -synctex=1 -output-directory=output {main}';

describe('compileCommand', () => {
	it('reads the output directory, defaulting to .', () => {
		expect(compileOutDir(DEFAULT)).toBe('output');
		expect(compileOutDir('pdflatex {main}')).toBe('.');
		expect(compileOutDir('latexmk -outdir="my out" {main}')).toBe('my out');
	});

	it('detects the engine (or null for the unrecognized)', () => {
		expect(detectEngine(DEFAULT)).toBe('lualatex');
		expect(detectEngine('xelatex {main}')).toBe('xelatex');
		expect(detectEngine('pdflatex {main}')).toBe('pdflatex');
		expect(detectEngine('latexmk -pdf {main}')).toBe('pdflatex');
		expect(detectEngine('make')).toBeNull();
		expect(detectEngine('tectonic {main}')).toBeNull();
		expect(usesLatexmk(DEFAULT)).toBe(true);
		expect(usesLatexmk('pdflatex {main}')).toBe(false);
	});

	it('regenerates a command carrying the output dir over', () => {
		expect(buildCompileCommand('xelatex', true, DEFAULT)).toBe(
			'latexmk -xelatex -interaction=nonstopmode -file-line-error -synctex=1 -output-directory=output {main}'
		);
		expect(buildCompileCommand('pdflatex', false, 'pdflatex {main}')).toBe(
			'pdflatex -interaction=nonstopmode -file-line-error -synctex=1 -output-directory=output {main}'
		);
	});

	it('resolves detected and overridden output paths', () => {
		const root = '/proj';
		const main = '/proj/main.tex';
		expect(detectedPdfPath(DEFAULT, root, main)).toBe('/proj/output/main.pdf');
		expect(detectedPdfPath('pdflatex {main}', root, main)).toBe('/proj/main.pdf');
		expect(detectedPdfPath(DEFAULT, null, main)).toBeNull();
		// a relative override is joined to root; absolute stays put
		expect(resolveOutputPath(root, 'build/out.pdf')).toBe('/proj/build/out.pdf');
		expect(resolveOutputPath(root, '/abs/out.pdf')).toBe('/abs/out.pdf');
		expect(expectedPdfPath(DEFAULT, root, main, 'build/x.pdf')).toBe('/proj/build/x.pdf');
		// the log sits next to the actual pdf, following the override
		expect(expectedLogPath(DEFAULT, root, main)).toBe('/proj/output/main.log');
		expect(expectedLogPath(DEFAULT, root, main, { pdf: 'build/x.pdf' })).toBe('/proj/build/x.log');
		expect(expectedLogPath('latexmk -auxdir=aux -output-directory=out {main}', root, main)).toBe('/proj/aux/main.log');
	});

	it('flags bad Advanced output paths', () => {
		expect(outputPathIssue('', '.pdf')).toBeNull();
		expect(outputPathIssue('out/main.pdf', '.pdf')).toBeNull();
		expect(outputPathIssue('{main}.pdf', '.pdf')).toBe('has-token');
		expect(outputPathIssue('main.tex', '.pdf')).toBe('wrong-ext');
	});
});
