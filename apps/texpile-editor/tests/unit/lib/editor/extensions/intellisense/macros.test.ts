import { describe, it, expect } from 'vitest';
import { macroOptions, macroLookup } from '../../../../../../src/lib/languages/latex/intellisense/completion/macros';
import { documentPackageNames } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { compileConfig } from '$lib/workspace/projectConfigSync.svelte';

const labels = async (text: string) => (await macroOptions(text)).map((o) => o.label);

describe('macro completion: the kernel, loaded packages and user-defined \\newcommand scan', () => {
	it('includes the kernel', async () => {
		const options = await macroOptions('');
		expect(options.length).toBeGreaterThan(1000);
		expect(options.some((o) => o.label === '\\section')).toBe(true);
	});

	it('offers the kernel commands the old lists had from package lists, as the kernel', async () => {
		const options = await macroOptions('\\documentclass{article}\n');
		for (const label of ['\\title', '\\author', '\\underbrace', '\\index', '\\centerline', '\\pdfoutput']) {
			const found = options.find((o) => o.label === label);
			expect(found, label).toBeTruthy();
			// not a common package's suggestion, which would offer \usepackage{authblk} for \author
			expect(found?.boost ?? 0, label).toBeGreaterThanOrEqual(0);
		}
	});

	it('offers what a package defines where the document loads it, with what it loads in turn', async () => {
		const detail = async (text: string, label: string) => (await macroOptions(text)).find((o) => o.label === label)?.detail;
		expect(await labels('')).not.toContain('\\chemfig');
		expect(await labels('\\usepackage{chemfig}\n')).toContain('\\chemfig');
		// mathtools loads amsmath, which loads amsopn
		expect(await detail('\\documentclass{article}\n\\usepackage{mathtools}\n', '\\DeclareMathOperator')).toBe('{}{}');
	});

	it("offers a common package's commands before it is loaded, below the rest and naming the package", async () => {
		const detail = async (text: string, label: string) => (await macroOptions(text)).find((o) => o.label === label)?.detail;
		expect(await detail('\\documentclass{article}\n', '\\includegraphics')).toBe('graphicx');
		expect(await detail('\\usepackage{graphicx}\n', '\\includegraphics')).not.toBe('graphicx');
		expect(await detail('\\documentclass{article}\n', '\\setcitestyle')).toBe('natbib');
		// biblatex is natbib's alternative
		expect(await detail('\\usepackage{biblatex}\n', '\\setcitestyle')).toBeUndefined();
		// with the packages unknown, texpile/ctan-base stands in and no package is named
		expect(await detail('', '\\includegraphics')).toBe('[]{}');
	});

	it('leaves out a common package that clashes with one the document loads', async () => {
		const detail = async (text: string, label: string) => (await macroOptions(text)).find((o) => o.label === label)?.detail;
		expect(await detail('\\documentclass{article}\n', '\\href')).toBe('hyperref');
		// hyperref fails to load after cleveref
		expect(await detail('\\usepackage{cleveref}\n', '\\href')).toBeUndefined();
		expect(await detail('\\documentclass{article}\n', '\\qedhere')).toBe('amsthm');
		expect(await detail('\\newenvironment{proof}{}{}\n', '\\qedhere')).toBeUndefined();
	});

	it("builds amsmath's \\pmatrix environment, not the kernel's plain TeX \\pmatrix", async () => {
		const pmatrix = (await macroOptions('\\usepackage{amsmath}\n')).find((o) => o.label === '\\pmatrix');
		expect(pmatrix?.detail).toBe('environment');
	});

	it('counts what a package loads under the engine of the compile command', async () => {
		const loads = async (command: string, name: string) => {
			compileConfig.current = { ...compileConfig.current, latex: { ...compileConfig.current.latex, command } };
			return (await documentPackageNames('\\usepackage{libertinus}\n')).has(name);
		};
		try {
			expect(await loads('latexmk -lualatex {main}', 'fontspec')).toBe(true);
			expect(await loads('latexmk -pdf {main}', 'fontspec')).toBe(false);
			// make names no engine: only what every engine loads
			expect(await loads('make', 'fontspec')).toBe(false);
			expect(await loads('make', 'xkeyval')).toBe(true);
		} finally {
			compileConfig.current = { ...compileConfig.current, latex: { ...compileConfig.current.latex, command: null } };
		}
	});

	it('counts what a package loads under its options', async () => {
		expect((await documentPackageNames('\\usepackage{xcolor}\n')).has('colortbl')).toBe(false);
		expect((await documentPackageNames('\\usepackage[table]{xcolor}\n')).has('colortbl')).toBe(true);
	});

	it('offers a command an option defines only under that option', async () => {
		expect(await labels('\\usepackage{biblatex}\n')).not.toContain('\\citep');
		expect(await labels('\\usepackage[natbib=true]{biblatex}\n')).toContain('\\citep');
		expect(await labels('\\usepackage[natbib]{biblatex}\n')).toContain('\\citep');
	});

	it('offers what a library adds once it is loaded', async () => {
		expect(await labels('\\usepackage{tcolorbox}\n')).not.toContain('\\tcbposter');
		expect(await labels('\\usepackage[most]{tcolorbox}\n')).toContain('\\tcbposter');
	});

	it('ignores a package loaded in a comment', async () => {
		expect(await labels('% \\usepackage{chemfig}\n')).not.toContain('\\chemfig');
	});

	it("picks up a user's own \\newcommand as a completion, tagged as defined in this file", async () => {
		const text = '\\newcommand{\\myMacro}[1]{Hello #1}\n\\myMacro{world}';
		const mine = (await macroOptions(text)).find((o) => o.label === '\\myMacro');
		expect(mine).toBeTruthy();
		expect(mine?.detail).toContain('defined in this file');
	});

	it("shows a user command's optional argument in its form", async () => {
		const mine = (await macroOptions('\\newcommand{\\myvec}[2][3]{#1#2}\n')).find((o) => o.label === '\\myvec');
		expect(mine?.detail).toBe('[]{} (defined in this file)');
	});

	it('does not duplicate a name the kernel already documents', async () => {
		const options = await macroOptions('\\renewcommand{\\section}[1]{X}\n\\renewcommand{\\alpha}{a}');
		expect(options.filter((o) => o.label === '\\section')).toHaveLength(1);
		expect(options.filter((o) => o.label === '\\alpha')).toHaveLength(1);
	});

	it('inserts empty fields, so the next completion opens unfiltered', async () => {
		const section = (await macroOptions('')).find((o) => o.label === '\\section');
		expect(section?.detail).toBe('[]{}');
		expect(typeof section?.apply).toBe('function');
	});

	it('marks math symbols with their glyph, and the math commands that are no symbol', async () => {
		const options = await macroOptions('');
		const leq = options.find((o) => o.label === '\\leq');
		expect(leq?.math).toBe(true);
		expect(leq?.detail).toBe('≤');
		expect(options.find((o) => o.label === '\\frac')?.math).toBe(true);
	});

	it('macroLookup finds a kernel macro, a user macro, and nothing for an unknown name', async () => {
		expect(await macroLookup('', 'section')).not.toBeNull();
		expect(await macroLookup('\\newcommand{\\myMacro}{x}', 'myMacro')).not.toBeNull();
		expect(await macroLookup('', 'totallyMadeUpMacroXyz')).toBeNull();
	});

	it('does not throw on an unparseable mid-edit buffer', async () => {
		await expect(macroOptions('\\newcommand{\\incomplete')).resolves.toBeTruthy();
	});
});

describe('the LaTeX Workshop forms', () => {
	it('completes \\begin and \\end, which chain into the environment list', async () => {
		const options = await macroOptions('');
		for (const label of ['\\begin', '\\end']) {
			const found = options.filter((o) => o.label === label);
			expect(found, label).toHaveLength(1);
			expect(typeof found[0].apply, `${label} chains via a custom apply`).toBe('function');
		}
	});

	it('completes the \\left( family next to the kernel', async () => {
		const all = await labels('');
		for (const label of ['\\alpha', '\\infty', '\\left(', '\\left|', '\\section*', '\\Huge']) expect(all, label).toContain(label);
	});

	it('never yields duplicate labels', async () => {
		const all = await labels('\\documentclass{book}\n\\usepackage{amsmath,tikz}\n\\newcommand{\\itemize}{x}');
		expect(new Set(all).size).toBe(all.length);
	});
});
